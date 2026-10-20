<?php
declare(strict_types=1);

require_once __DIR__ . '/database.php';

const SESSION_TTL = 43200;
const RESET_TTL = 3600;

function send_json(int $status, array $body, array $headers = []): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    foreach ($headers as $name => $value) {
        header($name . ': ' . $value);
    }
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function request_json(): array
{
    $length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > 1024 * 1024) {
        send_json(413, ['error' => 'Request body is too large.']);
    }
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > 1024 * 1024) {
        send_json(413, ['error' => 'Request body is too large.']);
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        send_json(400, ['error' => 'Please send valid JSON.']);
    }
    return $body;
}

function text_value(mixed $value, int $max): string
{
    if (!is_scalar($value)) {
        return '';
    }
    $text = trim((string)$value);
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $max, 'UTF-8');
    }
    return substr($text, 0, $max);
}

function password_length(string $password): int
{
    return function_exists('mb_strlen') ? mb_strlen($password, 'UTF-8') : strlen($password);
}

function hash_password(string $password): string
{
    // Pre-hash so bcrypt deployments do not silently truncate passwords past 72 bytes.
    return 'sha256$' . password_hash(hash('sha256', $password), PASSWORD_DEFAULT);
}

function verify_password(string $password, ?string $savedHash): bool
{
    if (!$savedHash || !str_starts_with($savedHash, 'sha256$')) {
        return false;
    }
    return password_verify(hash('sha256', $password), substr($savedHash, 7));
}

function uuid_v4(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}

function now_iso(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function same_origin(): bool
{
    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin === '') {
        return true;
    }
    $originHost = strtolower((string)parse_url($origin, PHP_URL_HOST));
    $requestHost = strtolower((string)parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST));
    return $originHost !== '' && $requestHost !== '' && hash_equals($requestHost, $originHost);
}

function require_same_origin(): void
{
    if (!same_origin()) {
        send_json(403, ['error' => 'Request origin was not accepted.']);
    }
}

function request_path(): string
{
    return rawurldecode((string)(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/'));
}

function secure_request(): bool
{
    return (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function start_role_session(string $role): void
{
    $name = $role === 'admin' ? 'ember_admin' : 'ember_client';
    $path = $role === 'admin' ? '/api/admin' : '/api';
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    $sessionPath = trim(app_setting('SESSION_SAVE_PATH')) ?: (__DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'sessions');
    if (!is_dir($sessionPath) && !@mkdir($sessionPath, 0700, true) && !is_dir($sessionPath)) {
        throw new RuntimeException('The private session folder could not be created.');
    }
    session_save_path($sessionPath);
    session_name($name);
    session_set_cookie_params([
        'lifetime' => SESSION_TTL,
        'path' => $path,
        'secure' => secure_request(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    if (!session_start() || session_status() !== PHP_SESSION_ACTIVE) {
        throw new RuntimeException('The private session could not be started.');
    }
}

function close_role_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
}

function clear_role_session(string $role): void
{
    start_role_session($role);
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $name = $role === 'admin' ? 'ember_admin' : 'ember_client';
        $path = $role === 'admin' ? '/api/admin' : '/api';
        setcookie($name, '', [
            'expires' => time() - 42000,
            'path' => $path,
            'secure' => secure_request(),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
    }
    session_destroy();
}

function create_role_session(string $role, ?string $userId, int $version): void
{
    start_role_session($role);
    session_regenerate_id(true);
    $_SESSION = [
        'role' => $role,
        'user_id' => $userId,
        'version' => $version,
        'expires_at' => time() + SESSION_TTL,
    ];
    close_role_session();
}

function valid_admin_identity(array $admin): bool
{
    return !empty($admin['verified'])
        && preg_match('/^[a-z0-9._-]{3,40}$/', strtolower(trim(app_setting('ADMIN_USERNAME')))) === 1
        && filter_var(strtolower(trim(app_setting('ADMIN_EMAIL'))), FILTER_VALIDATE_EMAIL) !== false
        && hash_equals((string)$admin['username'], strtolower(trim(app_setting('ADMIN_USERNAME'))))
        && hash_equals(strtolower((string)$admin['email']), strtolower(trim(app_setting('ADMIN_EMAIL'))));
}

function role_session(string $role, PDO $pdo, ?array $admin = null): ?array
{
    start_role_session($role);
    $saved = $_SESSION;
    if (($saved['role'] ?? '') !== $role || (int)($saved['expires_at'] ?? 0) < time()) {
        $_SESSION = [];
        close_role_session();
        return null;
    }

    if ($role === 'admin') {
        $current = $admin ?: install_admin($pdo);
        $accepted = valid_admin_identity($current) && (int)($saved['version'] ?? -1) === (int)$current['session_version'];
        if (!$accepted) {
            $_SESSION = [];
            close_role_session();
            return null;
        }
        $_SESSION['expires_at'] = time() + SESSION_TTL;
        close_role_session();
        return $current;
    }

    $userId = (string)($saved['user_id'] ?? '');
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = :id');
    $stmt->execute(['id' => $userId]);
    $user = $stmt->fetch();
    $accepted = $user && (int)($saved['version'] ?? -1) === (int)$user['session_version'];
    if (!$accepted) {
        $_SESSION = [];
        close_role_session();
        return null;
    }
    $_SESSION['expires_at'] = time() + SESSION_TTL;
    close_role_session();
    return $user;
}

function public_user(array $user): array
{
    return ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email']];
}

function public_project(array $project): array
{
    $tags = json_decode((string)$project['tags_json'], true);
    return [
        'id' => $project['id'], 'title' => $project['title'], 'category' => $project['category'],
        'year' => $project['year'], 'description' => $project['description'], 'projectUrl' => $project['project_url'],
        'tags' => is_array($tags) ? $tags : [], 'status' => $project['status'], 'createdAt' => $project['created_at'],
    ];
}

function public_inquiry(array $inquiry): array
{
    return [
        'id' => $inquiry['id'], 'userId' => $inquiry['user_id'], 'name' => $inquiry['name'], 'email' => $inquiry['email'],
        'service' => $inquiry['service'], 'budget' => $inquiry['budget'], 'details' => $inquiry['details'],
        'status' => $inquiry['status'], 'createdAt' => $inquiry['created_at'],
    ];
}

function escape_html(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function smtp_configured(): bool
{
    $host = trim(app_setting('SMTP_HOST'));
    $port = (int)app_setting('SMTP_PORT', '587');
    $user = trim(app_setting('SMTP_USER'));
    $pass = app_setting('SMTP_PASS');
    $from = smtp_from_email();
    return $host !== '' && $port > 0 && $port <= 65535 && $from !== '' && filter_var($from, FILTER_VALIDATE_EMAIL) !== false && (($user === '') === ($pass === ''));
}

function smtp_from_email(): string
{
    $from = trim(app_setting('SMTP_FROM', trim(app_setting('SMTP_USER')) ?: app_setting('ADMIN_EMAIL')));
    if (preg_match('/<\s*([^<>\s]+@[^<>\s]+)\s*>$/', $from, $match) === 1) {
        return trim($match[1]);
    }
    return $from;
}

function smtp_read($socket, array $expected): string
{
    $response = '';
    while (($line = fgets($socket, 2048)) !== false) {
        $response .= $line;
        if (preg_match('/^(\d{3})([ -])/', $line, $matches) === 1 && $matches[2] === ' ') {
            $code = (int)$matches[1];
            if (!in_array($code, $expected, true)) {
                throw new RuntimeException('SMTP server rejected a command with code ' . $code . '.');
            }
            return $response;
        }
    }
    throw new RuntimeException('SMTP server closed the connection unexpectedly.');
}

function smtp_command($socket, string $command, array $expected): string
{
    $data = $command . "\r\n";
    $offset = 0;
    while ($offset < strlen($data)) {
        $written = fwrite($socket, substr($data, $offset));
        if ($written === false || $written === 0) {
            throw new RuntimeException('Could not write to the SMTP server.');
        }
        $offset += $written;
    }
    return smtp_read($socket, $expected);
}

function smtp_send(string $to, string $subject, string $text, string $html): void
{
    if (!smtp_configured()) {
        throw new RuntimeException('Website email is not configured. Set the SMTP settings in the private environment file.');
    }
    if (filter_var($to, FILTER_VALIDATE_EMAIL) === false || preg_match('/[\r\n]/', $subject)) {
        throw new RuntimeException('The email recipient or subject is invalid.');
    }

    $host = trim(app_setting('SMTP_HOST'));
    $port = (int)app_setting('SMTP_PORT', '587');
    $secure = strtolower(trim(app_setting('SMTP_SECURE'))) === 'true' || $port === 465;
    $user = trim(app_setting('SMTP_USER'));
    $pass = app_setting('SMTP_PASS');
    $from = smtp_from_email();
    $transport = $secure ? 'ssl://' : 'tcp://';
    $context = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]]);
    $socket = @stream_socket_client($transport . $host . ':' . $port, $errno, $errstr, 12, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        throw new RuntimeException('Could not connect to the website SMTP server: ' . ($errstr ?: $errno));
    }

    try {
        stream_set_timeout($socket, 15);
        smtp_read($socket, [220]);
        $domain = (string)(parse_url(app_base_url(), PHP_URL_HOST) ?: 'localhost');
        smtp_command($socket, 'EHLO ' . preg_replace('/[^a-zA-Z0-9.-]/', '', $domain), [250]);
        if (!$secure) {
            smtp_command($socket, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('Could not establish secure TLS with the SMTP server.');
            }
            smtp_command($socket, 'EHLO ' . preg_replace('/[^a-zA-Z0-9.-]/', '', $domain), [250]);
        }
        if ($user !== '') {
            smtp_command($socket, 'AUTH LOGIN', [334]);
            smtp_command($socket, base64_encode($user), [334]);
            smtp_command($socket, base64_encode($pass), [235]);
        }
        smtp_command($socket, 'MAIL FROM:<' . $from . '>', [250]);
        smtp_command($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
        smtp_command($socket, 'DATA', [354]);

        $boundary = 'feg_' . bin2hex(random_bytes(14));
        $displayFrom = 'Fading Ember Games <' . $from . '>';
        $encodedSubject = function_exists('mb_encode_mimeheader') ? mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n") : '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $body = 'From: ' . $displayFrom . "\r\n"
            . 'To: <' . $to . ">\r\n"
            . 'Subject: ' . $encodedSubject . "\r\n"
            . 'MIME-Version: 1.0' . "\r\n"
            . 'Content-Type: multipart/alternative; boundary="' . $boundary . '"' . "\r\n\r\n"
            . '--' . $boundary . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($text))
            . '--' . $boundary . "\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($html))
            . '--' . $boundary . "--\r\n";
        $body = preg_replace('/(^|\r\n)\./', '$1..', $body) ?? $body;
        $data = $body . ".\r\n";
        $offset = 0;
        while ($offset < strlen($data)) {
            $written = fwrite($socket, substr($data, $offset));
            if ($written === false || $written === 0) {
                throw new RuntimeException('Could not send the email contents.');
            }
            $offset += $written;
        }
        smtp_read($socket, [250]);
        smtp_command($socket, 'QUIT', [221]);
    } finally {
        fclose($socket);
    }
}

function event_emails(array $messages): bool
{
    if (!smtp_configured()) {
        return false;
    }
    $allSent = count($messages) > 0;
    foreach ($messages as $message) {
        try {
            $text = (string)$message['text'];
            $html = '<div style="font-family:Arial,sans-serif;background:#0b0b10;color:#f0e6da;padding:32px"><div style="max-width:560px;margin:auto;background:#17161c;border:1px solid #40352c;padding:28px"><p style="color:#e88c32;letter-spacing:2px;font-size:12px">FADING EMBER GAMES</p><h2>' . escape_html((string)$message['subject']) . '</h2><p>' . nl2br(escape_html($text)) . '</p></div></div>';
            smtp_send((string)$message['to'], (string)$message['subject'], $text, $html);
        } catch (Throwable $error) {
            error_log('Website email failed: ' . $error->getMessage());
            $allSent = false;
        }
    }
    return $allSent;
}

function recovery_rate_limited(PDO $pdo): bool
{
    $now = time();
    $cutoff = $now - 900;
    $address = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    $ipHash = hash_hmac('sha256', $address, app_setting('APP_SECRET', __FILE__));
    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        $stmt = $pdo->prepare('INSERT INTO recovery_limits (ip_hash, window_started, attempts) VALUES (:ip, :started, 1) ON CONFLICT(ip_hash) DO UPDATE SET attempts = CASE WHEN recovery_limits.window_started < :cutoff THEN 1 ELSE recovery_limits.attempts + 1 END, window_started = CASE WHEN recovery_limits.window_started < :cutoff2 THEN :started2 ELSE recovery_limits.window_started END');
    } else {
        $stmt = $pdo->prepare('INSERT INTO recovery_limits (ip_hash, window_started, attempts) VALUES (:ip, :started, 1) ON DUPLICATE KEY UPDATE attempts = CASE WHEN window_started < :cutoff THEN 1 ELSE attempts + 1 END, window_started = CASE WHEN window_started < :cutoff2 THEN :started2 ELSE window_started END');
    }
    $stmt->execute(['ip' => $ipHash, 'started' => $now, 'cutoff' => $cutoff, 'cutoff2' => $cutoff, 'started2' => $now]);
    $stmt = $pdo->prepare('SELECT attempts FROM recovery_limits WHERE ip_hash = :ip');
    $stmt->execute(['ip' => $ipHash]);
    return (int)$stmt->fetchColumn() > 5;
}

function validate_project(array $body): array
{
    $title = text_value($body['title'] ?? '', 90);
    $category = text_value($body['category'] ?? '', 40);
    $year = text_value($body['year'] ?? '', 4);
    $description = text_value($body['description'] ?? '', 600);
    $projectUrl = text_value($body['projectUrl'] ?? ($body['coverImage'] ?? ''), 500);
    if ($title === '' || $category === '' || $description === '' || $projectUrl === '') {
        return ['error' => 'Add a project title, category, story, and project URL.'];
    }
    if (!filter_var($projectUrl, FILTER_VALIDATE_URL) || !in_array(strtolower((string)parse_url($projectUrl, PHP_URL_SCHEME)), ['http', 'https'], true)) {
        return ['error' => 'Project URL must use an http or https URL.'];
    }
    $rawTags = $body['tags'] ?? [];
    if (is_array($rawTags)) {
        $tagValues = $rawTags;
    } else {
        $tagValues = explode(',', text_value($rawTags, 120));
    }
    $tags = [];
    foreach ($tagValues as $tag) {
        $tag = text_value($tag, 24);
        if ($tag !== '' && count($tags) < 5) {
            $tags[] = $tag;
        }
    }
    return ['value' => [
        'title' => $title, 'category' => $category,
        'year' => preg_match('/^\d{4}$/', $year) === 1 ? $year : gmdate('Y'),
        'description' => $description, 'project_url' => $projectUrl, 'tags_json' => json_encode($tags, JSON_UNESCAPED_UNICODE),
        'status' => ($body['status'] ?? '') === 'Draft' ? 'Draft' : 'Published',
    ]];
}

function reset_email(string $email, string $role, string $resetUrl): void
{
    $accountName = $role === 'admin' ? 'studio' : 'client';
    $subject = 'Reset your Fading Ember Games password';
    $text = "We received a request to reset your {$accountName} password. Use this one-time link within 60 minutes:\n\n{$resetUrl}\n\nIf you did not request this, you can ignore this email.";
    $html = '<div style="font-family:Arial,sans-serif;background:#0b0b10;color:#f0e6da;padding:32px"><div style="max-width:520px;margin:auto;background:#17161c;border:1px solid #40352c;padding:28px"><p style="color:#e88c32;letter-spacing:2px;font-size:12px">FADING EMBER GAMES</p><h1 style="font-size:24px">Reset your password</h1><p>We received a request to reset your ' . escape_html($accountName) . ' password. This one-time link expires in 60 minutes.</p><p style="margin:28px 0"><a href="' . escape_html($resetUrl) . '" style="background:#e88c32;color:#17110b;text-decoration:none;padding:12px 18px;font-weight:bold">Reset password</a></p><p style="color:#aaa;font-size:13px">If you did not request this, you can ignore this email.</p></div></div>';
    smtp_send($email, $subject, $text, $html);
}

function route_id(string $path, string $prefix): ?string
{
    $pattern = '#^' . preg_quote($prefix, '#') . '/([^/]+)$#';
    return preg_match($pattern, $path, $match) === 1 ? $match[1] : null;
}

function run_api(): never
{
    $pdo = app_db();
    ensure_schema($pdo);
    $admin = install_admin($pdo);
    $path = request_path();
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if ($path === '/api/projects' && $method === 'GET') {
        $stmt = $pdo->query("SELECT * FROM projects WHERE status = 'Published' ORDER BY created_at DESC");
        send_json(200, ['projects' => array_map('public_project', $stmt->fetchAll())]);
    }

    if ($path === '/api/password/forgot' && $method === 'POST') {
        require_same_origin();
        if (recovery_rate_limited($pdo)) {
            send_json(429, ['error' => 'Too many recovery requests. Please wait 15 minutes and try again.']);
        }
        if (!smtp_configured()) {
            send_json(503, ['error' => 'The website mail relay is not configured. Set SMTP_HOST, SMTP_FROM, and any required SMTP credentials in the private .env file.']);
        }
        $body = request_json();
        $role = in_array(($body['role'] ?? ''), ['admin', 'client'], true) ? (string)$body['role'] : '';
        $email = strtolower(text_value($body['email'] ?? '', 160));
        if ($role === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            send_json(400, ['error' => 'Choose an account type and enter a valid email address.']);
        }
        if ($role === 'admin') {
            $account = strtolower((string)$admin['email']) === $email ? $admin : null;
            $accountId = 'admin';
        } else {
            $stmt = $pdo->prepare('SELECT * FROM users WHERE email = :email');
            $stmt->execute(['email' => $email]);
            $account = $stmt->fetch() ?: null;
            $accountId = $account ? (string)$account['id'] : '';
        }
        if ($account) {
            $token = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $token);
            $now = time();
            $stmt = $pdo->prepare('DELETE FROM password_resets WHERE role = :role AND account_id = :account');
            $stmt->execute(['role' => $role, 'account' => $accountId]);
            $stmt = $pdo->prepare('INSERT INTO password_resets (token_hash, role, account_id, expires_at, created_at) VALUES (:token, :role, :account, :expires, :created)');
            $stmt->execute(['token' => $tokenHash, 'role' => $role, 'account' => $accountId, 'expires' => $now + RESET_TTL, 'created' => $now]);
            $resetUrl = app_base_url() . '/reset-password?role=' . rawurlencode($role) . '&token=' . rawurlencode($token);
            try {
                reset_email((string)$account['email'], $role, $resetUrl);
            } catch (Throwable $error) {
                error_log('Password recovery email failed: ' . $error->getMessage());
                $stmt = $pdo->prepare('DELETE FROM password_resets WHERE token_hash = :token');
                $stmt->execute(['token' => $tokenHash]);
                send_json(502, ['error' => 'We could not send the reset email. Check the mail settings and try again.']);
            }
        }
        send_json(200, ['ok' => true, 'message' => 'If an account matches that email, a reset link has been sent.']);
    }

    if ($path === '/api/password/reset' && $method === 'POST') {
        require_same_origin();
        $body = request_json();
        $role = in_array(($body['role'] ?? ''), ['admin', 'client'], true) ? (string)$body['role'] : '';
        $token = (string)($body['token'] ?? '');
        $password = (string)($body['password'] ?? '');
        $length = password_length($password);
        if ($role === '' || preg_match('/^[a-f0-9]{64}$/i', $token) !== 1) {
            send_json(400, ['error' => 'This reset link is invalid or incomplete.']);
        }
        if ($length < 10 || $length > 128) {
            send_json(400, ['error' => 'Choose a password between 10 and 128 characters.']);
        }
        $now = time();
        $tokenHash = hash('sha256', $token);
        $pdo->beginTransaction();
        try {
            $sql = 'SELECT * FROM password_resets WHERE role = :role AND token_hash = :token AND expires_at > :now';
            if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
                $sql .= ' FOR UPDATE';
            }
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['role' => $role, 'token' => $tokenHash, 'now' => $now]);
            $reset = $stmt->fetch();
            if (!$reset) {
                $pdo->rollBack();
                send_json(400, ['error' => 'This reset link has expired or has already been used. Request a new one.']);
            }
            $hash = hash_password($password);
            if ($role === 'admin') {
                if ($reset['account_id'] !== 'admin') {
                    $pdo->rollBack();
                    send_json(400, ['error' => 'This reset link is invalid.']);
                }
                $stmt = $pdo->prepare('UPDATE admins SET password_hash = :hash, session_version = session_version + 1 WHERE id = 1');
                $stmt->execute(['hash' => $hash]);
            } else {
                $stmt = $pdo->prepare('UPDATE users SET password_hash = :hash, session_version = session_version + 1 WHERE id = :id');
                $stmt->execute(['hash' => $hash, 'id' => $reset['account_id']]);
                if ($stmt->rowCount() === 0) {
                    $check = $pdo->prepare('SELECT id FROM users WHERE id = :id');
                    $check->execute(['id' => $reset['account_id']]);
                    if (!$check->fetchColumn()) {
                        $pdo->rollBack();
                        send_json(400, ['error' => 'This reset link is invalid.']);
                    }
                }
            }
            $stmt = $pdo->prepare('DELETE FROM password_resets WHERE role = :role AND account_id = :account');
            $stmt->execute(['role' => $role, 'account' => $reset['account_id']]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        send_json(200, ['ok' => true, 'message' => 'Your password has been updated. You can sign in now.']);
    }

    if (str_starts_with($path, '/api/auth/')) {
        require_same_origin();
        if ($path === '/api/auth/session' && $method === 'GET') {
            $user = role_session('client', $pdo);
            send_json(200, ['authenticated' => (bool)$user, 'user' => $user ? public_user($user) : null]);
        }
        if ($path === '/api/auth/register' && $method === 'POST') {
            $body = request_json();
            $name = text_value($body['name'] ?? '', 100);
            $email = strtolower(text_value($body['email'] ?? '', 160));
            $password = (string)($body['password'] ?? '');
            $length = password_length($password);
            if ($name === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                send_json(400, ['error' => 'Add your name and a valid email address.']);
            }
            if ($length < 10 || $length > 128) {
                send_json(400, ['error' => 'Choose a password between 10 and 128 characters.']);
            }
            $user = ['id' => uuid_v4(), 'name' => $name, 'email' => $email, 'created_at' => now_iso()];
            try {
                $stmt = $pdo->prepare('INSERT INTO users (id, name, email, password_hash, session_version, created_at) VALUES (:id, :name, :email, :hash, 0, :created)');
                $stmt->execute(['id' => $user['id'], 'name' => $name, 'email' => $email, 'hash' => hash_password($password), 'created' => $user['created_at']]);
            } catch (PDOException $error) {
                if ((string)$error->getCode() === '23000' || (string)$error->getCode() === '23505') {
                    send_json(409, ['error' => 'An account already uses that email. Please sign in instead.']);
                }
                throw $error;
            }
            create_role_session('client', $user['id'], 0);
            $emailSent = event_emails([
                ['to' => $email, 'subject' => 'Welcome to Fading Ember Games', 'text' => "Hi {$name},\n\nYour client account has been created. You can now send project inquiries through our website."],
                ['to' => (string)$admin['email'], 'subject' => 'New client account created', 'text' => "A new client account was created.\n\nName: {$name}\nEmail: {$email}\nCreated: {$user['created_at']}"],
            ]);
            send_json(201, ['ok' => true, 'user' => ['id' => $user['id'], 'name' => $name, 'email' => $email], 'emailSent' => $emailSent]);
        }
        if ($path === '/api/auth/login' && $method === 'POST') {
            $body = request_json();
            $email = strtolower(text_value($body['email'] ?? '', 160));
            $password = (string)($body['password'] ?? '');
            $stmt = $pdo->prepare('SELECT * FROM users WHERE email = :email');
            $stmt->execute(['email' => $email]);
            $user = $stmt->fetch();
            if (!$user || password_length($password) > 128 || !verify_password($password, $user['password_hash'])) {
                send_json(401, ['error' => 'Email or password did not match.']);
            }
            create_role_session('client', (string)$user['id'], (int)$user['session_version']);
            $signedInAt = now_iso();
            $emailSent = event_emails([
                ['to' => (string)$user['email'], 'subject' => 'New sign-in to your Fading Ember Games account', 'text' => "Hi {$user['name']},\n\nYour account was signed in at {$signedInAt}. If this was not you, reset your password and contact the studio."],
                ['to' => (string)$admin['email'], 'subject' => 'Client signed in to Fading Ember Games', 'text' => "A client signed in to their account.\n\nName: {$user['name']}\nEmail: {$user['email']}\nTime: {$signedInAt}"],
            ]);
            send_json(200, ['ok' => true, 'user' => public_user($user), 'emailSent' => $emailSent]);
        }
        if ($path === '/api/auth/logout' && $method === 'POST') {
            clear_role_session('client');
            send_json(200, ['ok' => true]);
        }
        send_json(404, ['error' => 'Account endpoint was not found.']);
    }

    if ($path === '/api/inquiries' && $method === 'POST') {
        require_same_origin();
        $user = role_session('client', $pdo);
        if (!$user) {
            send_json(401, ['error' => 'Create a client account or sign in before sending an inquiry.']);
        }
        $body = request_json();
        $service = text_value($body['service'] ?? '', 60);
        $details = text_value($body['details'] ?? '', 1800);
        if ($service === '' || password_length($details) < 12) {
            send_json(400, ['error' => 'Choose a service and add a few project details.']);
        }
        $inquiry = [
            'id' => uuid_v4(), 'user_id' => $user['id'], 'name' => $user['name'], 'email' => $user['email'],
            'service' => $service, 'budget' => text_value($body['budget'] ?? '', 60), 'details' => $details,
            'status' => 'New', 'created_at' => now_iso(),
        ];
        $stmt = $pdo->prepare('INSERT INTO inquiries (id, user_id, name, email, service, budget, details, status, created_at) VALUES (:id, :user_id, :name, :email, :service, :budget, :details, :status, :created)');
        $stmt->execute(['id' => $inquiry['id'], 'user_id' => $inquiry['user_id'], 'name' => $inquiry['name'], 'email' => $inquiry['email'], 'service' => $inquiry['service'], 'budget' => $inquiry['budget'], 'details' => $details, 'status' => 'New', 'created' => $inquiry['created_at']]);
        $clientText = "Hi {$inquiry['name']},\n\nThanks for reaching out to Fading Ember Games. We received your " . strtolower($service) . " inquiry and will be in touch soon.\n\nBest,\nFading Ember Games";
        $adminText = "A new project inquiry was submitted.\n\nClient: {$inquiry['name']}\nEmail: {$inquiry['email']}\nService: {$service}\nBudget: " . ($inquiry['budget'] ?: 'Not shared') . "\n\nProject details:\n{$details}";
        $emailSent = event_emails([
            ['to' => (string)$inquiry['email'], 'subject' => 'We received your ' . $service . ' inquiry', 'text' => $clientText],
            ['to' => (string)$admin['email'], 'subject' => 'New ' . $service . ' inquiry from ' . $inquiry['name'], 'text' => $adminText],
        ]);
        send_json(201, ['ok' => true, 'emailSent' => $emailSent]);
    }

    if (str_starts_with($path, '/api/admin/')) {
        if ($method !== 'GET') {
            require_same_origin();
        }
        if ($path === '/api/admin/login' && $method === 'POST') {
            $body = request_json();
            $username = strtolower(text_value($body['username'] ?? '', 40));
            $password = (string)($body['password'] ?? '');
            $accepted = valid_admin_identity($admin)
                && hash_equals((string)$admin['username'], $username)
                && password_length($password) <= 128
                && verify_password($password, $admin['password_hash'] ?? null);
            if (!$accepted) {
                send_json(401, ['error' => 'Admin identity or password did not match.']);
            }
            create_role_session('admin', null, (int)$admin['session_version']);
            $signedInAt = now_iso();
            $emailSent = event_emails([
                ['to' => (string)$admin['email'], 'subject' => 'Studio sign-in alert', 'text' => "A Fading Ember Games admin account signed in at {$signedInAt}. If this was not you, reset the studio password immediately."],
            ]);
            send_json(200, ['ok' => true, 'emailSent' => $emailSent]);
        }
        if ($path === '/api/admin/session' && $method === 'GET') {
            send_json(200, ['authenticated' => (bool)role_session('admin', $pdo, $admin)]);
        }
        if ($path === '/api/admin/logout' && $method === 'POST') {
            clear_role_session('admin');
            send_json(200, ['ok' => true]);
        }
        if (!role_session('admin', $pdo, $admin)) {
            send_json(401, ['error' => 'Please sign in to continue.']);
        }

        if (preg_match('#^/api/admin/inquiries/([^/]+)/reply$#', $path, $match) === 1 && $method === 'POST') {
            $stmt = $pdo->prepare('SELECT * FROM inquiries WHERE id = :id');
            $stmt->execute(['id' => $match[1]]);
            $inquiry = $stmt->fetch();
            if (!$inquiry) {
                send_json(404, ['error' => 'Inquiry was not found.']);
            }
            $body = request_json();
            $subject = text_value($body['subject'] ?? '', 140);
            $message = text_value($body['message'] ?? '', 4000);
            if ($subject === '' || password_length($message) < 2) {
                send_json(400, ['error' => 'Add an email subject and message.']);
            }
            try {
                $html = '<div style="font-family:Arial,sans-serif;background:#0b0b10;color:#f0e6da;padding:32px"><div style="max-width:560px;margin:auto;background:#17161c;border:1px solid #40352c;padding:28px"><p style="color:#e88c32;letter-spacing:2px;font-size:12px">FADING EMBER GAMES</p><p>' . nl2br(escape_html($message)) . '</p></div></div>';
                smtp_send((string)$inquiry['email'], $subject, $message, $html);
            } catch (Throwable $error) {
                error_log('Inquiry reply email failed: ' . $error->getMessage());
                send_json(502, ['error' => 'The email could not be sent. Check the website mail relay and try again.']);
            }
            send_json(200, ['ok' => true]);
        }

        if ($path === '/api/admin/overview' && $method === 'GET') {
            $projects = array_map('public_project', $pdo->query('SELECT * FROM projects ORDER BY created_at DESC')->fetchAll());
            $inquiries = array_map('public_inquiry', $pdo->query('SELECT * FROM inquiries ORDER BY created_at DESC')->fetchAll());
            send_json(200, ['projects' => $projects, 'inquiries' => $inquiries]);
        }
        if ($path === '/api/admin/projects' && $method === 'POST') {
            $checked = validate_project(request_json());
            if (isset($checked['error'])) {
                send_json(400, ['error' => $checked['error']]);
            }
            $project = $checked['value'];
            $project['id'] = uuid_v4();
            $project['created_at'] = now_iso();
            $stmt = $pdo->prepare('INSERT INTO projects (id, title, category, year, description, project_url, tags_json, status, created_at) VALUES (:id, :title, :category, :year, :description, :url, :tags, :status, :created)');
            $stmt->execute(['id' => $project['id'], 'title' => $project['title'], 'category' => $project['category'], 'year' => $project['year'], 'description' => $project['description'], 'url' => $project['project_url'], 'tags' => $project['tags_json'], 'status' => $project['status'], 'created' => $project['created_at']]);
            send_json(201, ['project' => public_project($project)]);
        }

        $projectId = route_id($path, '/api/admin/projects');
        if ($projectId !== null && $method === 'PUT') {
            $check = $pdo->prepare('SELECT id, created_at FROM projects WHERE id = :id');
            $check->execute(['id' => $projectId]);
            $existing = $check->fetch();
            if (!$existing) {
                send_json(404, ['error' => 'Project was not found.']);
            }
            $checked = validate_project(request_json());
            if (isset($checked['error'])) {
                send_json(400, ['error' => $checked['error']]);
            }
            $project = $checked['value'];
            $project['id'] = $projectId;
            $project['created_at'] = $existing['created_at'];
            $stmt = $pdo->prepare('UPDATE projects SET title = :title, category = :category, year = :year, description = :description, project_url = :url, tags_json = :tags, status = :status WHERE id = :id');
            $stmt->execute(['title' => $project['title'], 'category' => $project['category'], 'year' => $project['year'], 'description' => $project['description'], 'url' => $project['project_url'], 'tags' => $project['tags_json'], 'status' => $project['status'], 'id' => $projectId]);
            send_json(200, ['project' => public_project($project)]);
        }
        if ($projectId !== null && $method === 'DELETE') {
            $stmt = $pdo->prepare('DELETE FROM projects WHERE id = :id');
            $stmt->execute(['id' => $projectId]);
            if ($stmt->rowCount() === 0) {
                send_json(404, ['error' => 'Project was not found.']);
            }
            send_json(200, ['ok' => true]);
        }

        $inquiryId = route_id($path, '/api/admin/inquiries');
        if ($inquiryId !== null && $method === 'PUT') {
            $body = request_json();
            if (!in_array(($body['status'] ?? ''), ['New', 'In progress', 'Maintenance', 'Closed'], true)) {
                send_json(400, ['error' => 'Choose a valid inquiry status.']);
            }
            $stmt = $pdo->prepare('SELECT * FROM inquiries WHERE id = :id');
            $stmt->execute(['id' => $inquiryId]);
            $inquiry = $stmt->fetch();
            if (!$inquiry) {
                send_json(404, ['error' => 'Inquiry was not found.']);
            }
            $previousStatus = (string)$inquiry['status'];
            $inquiry['status'] = (string)$body['status'];
            $stmt = $pdo->prepare('UPDATE inquiries SET status = :status WHERE id = :id');
            $stmt->execute(['status' => $inquiry['status'], 'id' => $inquiryId]);
            $statusChanged = $previousStatus !== $inquiry['status'];
            $emailSent = $statusChanged ? event_emails([
                ['to' => (string)$inquiry['email'], 'subject' => 'Project inquiry update: ' . $inquiry['status'], 'text' => "Hi {$inquiry['name']},\n\nThe status of your {$inquiry['service']} inquiry has changed from “{$previousStatus}” to “{$inquiry['status']}”.\n\nIf you have questions, reply to this email and the studio team will get back to you."],
                ['to' => (string)$admin['email'], 'subject' => 'Inquiry status changed to ' . $inquiry['status'], 'text' => "An inquiry status was updated.\n\nClient: {$inquiry['name']}\nEmail: {$inquiry['email']}\nService: {$inquiry['service']}\nStatus: {$previousStatus} → {$inquiry['status']}"],
            ]) : false;
            send_json(200, ['inquiry' => public_inquiry($inquiry), 'statusChanged' => $statusChanged, 'emailSent' => $emailSent]);
        }
        if ($inquiryId !== null && $method === 'DELETE') {
            $stmt = $pdo->prepare('DELETE FROM inquiries WHERE id = :id');
            $stmt->execute(['id' => $inquiryId]);
            if ($stmt->rowCount() === 0) {
                send_json(404, ['error' => 'Inquiry was not found.']);
            }
            send_json(200, ['ok' => true]);
        }
        send_json(404, ['error' => 'Admin endpoint was not found.']);
    }

    send_json(404, ['error' => 'Endpoint was not found.']);
}

try {
    run_api();
} catch (Throwable $error) {
    error_log('Fading Ember Games PHP backend error: ' . $error->getMessage());
    send_json(500, ['error' => 'The server hit a snag. Check the PHP error log and database settings, then try again.']);
}
