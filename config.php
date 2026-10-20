<?php
declare(strict_types=1);

/** Load deployment settings from the process environment or a private project .env. */
function app_setting(string $key, string $default = ''): string
{
    static $dotenv = null;
    if ($dotenv === null) {
        $dotenv = [];
        $envFile = __DIR__ . DIRECTORY_SEPARATOR . '.env';
        if (is_file($envFile)) {
            foreach (@file($envFile, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                    continue;
                }
                [$name, $value] = explode('=', $line, 2);
                $name = trim($name);
                $value = trim($value);
                if ($name === '') {
                    continue;
                }
                if (strlen($value) >= 2 && (($value[0] === '"' && $value[-1] === '"') || ($value[0] === "'" && $value[-1] === "'"))) {
                    $value = substr($value, 1, -1);
                }
                $dotenv[$name] = $value;
            }
        }
    }

    $fromEnvironment = getenv($key);
    if ($fromEnvironment !== false) {
        return (string)$fromEnvironment;
    }
    return (string)($dotenv[$key] ?? $default);
}

function app_base_url(): string
{
    $configured = trim(app_setting('APP_BASE_URL'));
    if ($configured !== '') {
        return rtrim($configured, '/');
    }
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
        || (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');
    return ($https ? 'https://' : 'http://') . $host;
}

function app_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dsn = trim(app_setting('DB_DSN'));
    $username = app_setting('DB_USER');
    $password = app_setting('DB_PASS');
    if ($dsn === '') {
        $host = app_setting('DB_HOST');
        $name = app_setting('DB_NAME');
        $port = app_setting('DB_PORT', '3306');
        if ($host === '' || $name === '') {
            throw new RuntimeException('Database settings are missing. Set DB_HOST, DB_NAME, DB_USER, and DB_PASS.');
        }
        $dsn = 'mysql:host=' . $host . ';port=' . (ctype_digit($port) ? $port : '3306') . ';dbname=' . $name . ';charset=utf8mb4';
    }

    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
        $pdo->exec("SET time_zone = '+00:00'");
    }
    return $pdo;
}
