<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

/** Create the small application schema on first use. Hostinger's database user must have CREATE privileges. */
function ensure_schema(PDO $pdo): void
{
    static $ready = false;
    if ($ready) {
        return;
    }

    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        $statements = [
            'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NULL, session_version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, username TEXT NOT NULL, email TEXT NOT NULL, password_hash TEXT NULL, verified INTEGER NOT NULL DEFAULT 0, session_version INTEGER NOT NULL DEFAULT 0)',
            'CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, year TEXT NOT NULL, description TEXT NOT NULL, project_url TEXT NOT NULL, tags_json TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS inquiries (id TEXT PRIMARY KEY, user_id TEXT NULL, name TEXT NOT NULL, email TEXT NOT NULL, service TEXT NOT NULL, budget TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT, token_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)',
            'CREATE INDEX IF NOT EXISTS idx_password_resets_account ON password_resets (role, account_id)',
            'CREATE TABLE IF NOT EXISTS login_attempts (bucket_hash TEXT PRIMARY KEY, window_started INTEGER NOT NULL, attempts INTEGER NOT NULL)',
            'CREATE INDEX IF NOT EXISTS idx_login_attempts_window ON login_attempts (window_started)',
            'CREATE INDEX IF NOT EXISTS idx_projects_publication ON projects (status, created_at)',
            'CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries (created_at)',
            'CREATE TABLE IF NOT EXISTS recovery_limits (ip_hash TEXT PRIMARY KEY, window_started INTEGER NOT NULL, attempts INTEGER NOT NULL)',
        ];
    } else {
        $statements = [
            'CREATE TABLE IF NOT EXISTS users (id VARCHAR(36) PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(160) NOT NULL UNIQUE, password_hash VARCHAR(255) NULL, session_version INT UNSIGNED NOT NULL DEFAULT 0, created_at VARCHAR(35) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS admins (id TINYINT UNSIGNED PRIMARY KEY, username VARCHAR(40) NOT NULL, email VARCHAR(160) NOT NULL, password_hash VARCHAR(255) NULL, verified TINYINT(1) NOT NULL DEFAULT 0, session_version INT UNSIGNED NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS projects (id VARCHAR(64) PRIMARY KEY, title VARCHAR(90) NOT NULL, category VARCHAR(40) NOT NULL, year CHAR(4) NOT NULL, description VARCHAR(600) NOT NULL, project_url VARCHAR(500) NOT NULL, tags_json TEXT NOT NULL, status VARCHAR(20) NOT NULL, created_at VARCHAR(35) NOT NULL, INDEX idx_projects_publication (status, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS inquiries (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(36) NULL, name VARCHAR(100) NOT NULL, email VARCHAR(160) NOT NULL, service VARCHAR(60) NOT NULL, budget VARCHAR(60) NOT NULL, details VARCHAR(1800) NOT NULL, status VARCHAR(20) NOT NULL, created_at VARCHAR(35) NOT NULL, INDEX idx_inquiries_created (created_at), CONSTRAINT fk_inquiries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS password_resets (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, token_hash CHAR(64) NOT NULL UNIQUE, role VARCHAR(10) NOT NULL, account_id VARCHAR(36) NOT NULL, expires_at BIGINT UNSIGNED NOT NULL, created_at BIGINT UNSIGNED NOT NULL, INDEX idx_password_resets_account (role, account_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS login_attempts (bucket_hash CHAR(64) PRIMARY KEY, window_started BIGINT UNSIGNED NOT NULL, attempts INT UNSIGNED NOT NULL, INDEX idx_login_attempts_window (window_started)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS recovery_limits (ip_hash CHAR(64) PRIMARY KEY, window_started BIGINT UNSIGNED NOT NULL, attempts INT UNSIGNED NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        ];
    }

    foreach ($statements as $statement) {
        $pdo->exec($statement);
    }
    $ready = true;
}

function install_admin(PDO $pdo): array
{
    $configuredUsername = strtolower(trim(app_setting('ADMIN_USERNAME')));
    $configuredEmail = strtolower(trim(app_setting('ADMIN_EMAIL')));
    $usernameValid = preg_match('/^[a-z0-9._-]{3,40}$/', $configuredUsername) === 1;
    $emailValid = filter_var($configuredEmail, FILTER_VALIDATE_EMAIL) !== false;
    $configuredPassword = app_setting('ADMIN_PASSWORD');

    $stmt = $pdo->query('SELECT * FROM admins WHERE id = 1');
    $admin = $stmt->fetch();
    if (!$admin) {
        $email = $emailValid ? $configuredEmail : 'studio@fadingembergames.local';
        $username = $usernameValid ? $configuredUsername : 'studio-admin';
        $hash = strlen($configuredPassword) >= 10 && strlen($configuredPassword) <= 128 ? 'sha256$' . password_hash(hash('sha256', $configuredPassword), PASSWORD_DEFAULT) : null;
        $stmt = $pdo->prepare('INSERT INTO admins (id, username, email, password_hash, verified, session_version) VALUES (1, :username, :email, :hash, :verified, 0)');
        try {
            $stmt->execute(['username' => $username, 'email' => $email, 'hash' => $hash, 'verified' => ($usernameValid && $emailValid) ? 1 : 0]);
        } catch (PDOException $error) {
            $admin = $pdo->query('SELECT * FROM admins WHERE id = 1')->fetch();
            if (!$admin) {
                throw $error;
            }
        }
        $admin = $pdo->query('SELECT * FROM admins WHERE id = 1')->fetch();
    } else {
        $username = $usernameValid ? $configuredUsername : (string)$admin['username'];
        $email = $emailValid ? $configuredEmail : (string)$admin['email'];
        $verified = $usernameValid && $emailValid;
        $hash = $admin['password_hash'];
        if (!$hash && strlen($configuredPassword) >= 10 && strlen($configuredPassword) <= 128) {
            $hash = 'sha256$' . password_hash(hash('sha256', $configuredPassword), PASSWORD_DEFAULT);
        }
        $stmt = $pdo->prepare('UPDATE admins SET username = :username, email = :email, password_hash = :hash, verified = :verified WHERE id = 1');
        $stmt->execute(['username' => $username, 'email' => $email, 'hash' => $hash, 'verified' => $verified ? 1 : 0]);
        $admin['verified'] = $verified ? 1 : 0;
        $admin['username'] = $username;
        $admin['email'] = $email;
        $admin['password_hash'] = $hash;
    }
    return $admin ?: [];
}
