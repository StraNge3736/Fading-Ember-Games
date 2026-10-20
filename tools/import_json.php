<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/database.php';

function import_text(string $value, int $max): string
{
    return function_exists('mb_substr') ? mb_substr($value, 0, $max, 'UTF-8') : substr($value, 0, $max);
}

$source = $argv[1] ?? dirname(__DIR__) . '/data/store.json';
if (!is_file($source)) {
    fwrite(STDERR, "Could not read the JSON store. Usage: php tools/import_json.php [path-to-store.json]\n");
    exit(1);
}
$raw = @file_get_contents($source);
if ($raw === false) {
    fwrite(STDERR, "Could not read the JSON store. Check the file path and permissions.\n");
    exit(1);
}
$data = json_decode($raw, true);
if (!is_array($data)) {
    fwrite(STDERR, "The JSON store is not valid JSON.\n");
    exit(1);
}

try {
    $pdo = app_db();
    ensure_schema($pdo);
    install_admin($pdo);
    $pdo->beginTransaction();
    $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
    $ignore = $driver === 'sqlite' ? 'INSERT OR IGNORE' : 'INSERT IGNORE';
    $imported = ['projects' => 0, 'users' => 0, 'inquiries' => 0];

    foreach (($data['projects'] ?? []) as $project) {
        if (!is_array($project) || empty($project['id'])) {
            continue;
        }
        $projectUrl = trim((string)($project['projectUrl'] ?? $project['coverImage'] ?? ''));
        if (!filter_var($projectUrl, FILTER_VALIDATE_URL) || !in_array(strtolower((string)parse_url($projectUrl, PHP_URL_SCHEME)), ['http', 'https'], true)) {
            continue;
        }
        $stmt = $pdo->prepare($ignore . ' INTO projects (id, title, category, year, description, project_url, tags_json, status, created_at) VALUES (:id, :title, :category, :year, :description, :url, :tags, :status, :created)');
        $tags = is_array($project['tags'] ?? null) ? $project['tags'] : [];
        $stmt->execute([
            'id' => (string)$project['id'], 'title' => import_text((string)($project['title'] ?? ''), 90),
            'category' => import_text((string)($project['category'] ?? ''), 40),
            'year' => preg_match('/^\d{4}$/', (string)($project['year'] ?? '')) ? (string)$project['year'] : gmdate('Y'),
            'description' => import_text((string)($project['description'] ?? ''), 600),
            'url' => import_text($projectUrl, 500),
            'tags' => json_encode(array_slice($tags, 0, 5), JSON_UNESCAPED_UNICODE),
            'status' => ($project['status'] ?? '') === 'Draft' ? 'Draft' : 'Published',
            'created' => (string)($project['createdAt'] ?? gmdate('Y-m-d\TH:i:s\Z')),
        ]);
        $imported['projects'] += $stmt->rowCount();
    }

    foreach (($data['users'] ?? []) as $user) {
        if (!is_array($user) || empty($user['id']) || filter_var((string)($user['email'] ?? ''), FILTER_VALIDATE_EMAIL) === false) {
            continue;
        }
        // Node.js scrypt hashes are retained in the JSON backup but cannot be verified by PHP's built-in password API.
        // The client can set a PHP password by requesting the normal one-time reset email after migration.
        $stmt = $pdo->prepare($ignore . ' INTO users (id, name, email, password_hash, session_version, created_at) VALUES (:id, :name, :email, NULL, 0, :created)');
        $stmt->execute([
            'id' => (string)$user['id'], 'name' => import_text((string)($user['name'] ?? ''), 100),
            'email' => strtolower((string)$user['email']), 'created' => (string)($user['createdAt'] ?? gmdate('Y-m-d\TH:i:s\Z')),
        ]);
        $imported['users'] += $stmt->rowCount();
    }

    foreach (($data['inquiries'] ?? []) as $inquiry) {
        if (!is_array($inquiry) || empty($inquiry['id']) || filter_var((string)($inquiry['email'] ?? ''), FILTER_VALIDATE_EMAIL) === false) {
            continue;
        }
        $userId = isset($inquiry['userId']) ? (string)$inquiry['userId'] : null;
        if ($userId !== null) {
            $check = $pdo->prepare('SELECT id FROM users WHERE id = :id');
            $check->execute(['id' => $userId]);
            if (!$check->fetchColumn()) {
                $userId = null;
            }
        }
        $status = in_array(($inquiry['status'] ?? ''), ['New', 'In progress', 'Maintenance', 'Closed'], true) ? (string)$inquiry['status'] : 'New';
        $stmt = $pdo->prepare($ignore . ' INTO inquiries (id, user_id, name, email, service, budget, details, status, created_at) VALUES (:id, :user_id, :name, :email, :service, :budget, :details, :status, :created)');
        $stmt->execute([
            'id' => (string)$inquiry['id'], 'user_id' => $userId,
            'name' => import_text((string)($inquiry['name'] ?? ''), 100),
            'email' => strtolower((string)$inquiry['email']), 'service' => import_text((string)($inquiry['service'] ?? 'Other'), 60),
            'budget' => import_text((string)($inquiry['budget'] ?? ''), 60),
            'details' => import_text((string)($inquiry['details'] ?? ''), 1800),
            'status' => $status, 'created' => (string)($inquiry['createdAt'] ?? gmdate('Y-m-d\TH:i:s\Z')),
        ]);
        $imported['inquiries'] += $stmt->rowCount();
    }

    $pdo->commit();

    echo 'Imported rows: ' . json_encode($imported, JSON_UNESCAPED_SLASHES) . "\n";
    echo "Existing client passwords need a one-time reset through the website recovery page.\n";
    echo "The original JSON store was left unchanged.\n";
} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, 'Import failed: ' . $error->getMessage() . "\n");
    exit(1);
}
