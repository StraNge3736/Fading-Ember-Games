<?php
declare(strict_types=1);

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
if (str_starts_with($path, '/api')) {
    require __DIR__ . '/api.php';
    exit;
}

if ($path === '/') {
    $file = __DIR__ . '/public/index.html';
} elseif ($path === '/admin' || $path === '/admin/') {
    $file = __DIR__ . '/public/admin.html';
} elseif (in_array(rtrim($path, '/'), ['/forgot-password', '/reset-password'], true)) {
    $file = __DIR__ . '/public/recovery.html';
} else {
    $relative = rawurldecode(ltrim($path, '/'));
    if (str_contains($relative, "\0") || str_contains($relative, '..') || str_starts_with($relative, 'public/')) {
        http_response_code(404);
        exit('This page has gone cold.');
    }
    $file = __DIR__ . '/public/' . $relative;
}

$real = realpath($file);
$public = realpath(__DIR__ . '/public');
if (!$real || !$public || !str_starts_with($real, $public . DIRECTORY_SEPARATOR) || !is_file($real)) {
    http_response_code(404);
    exit('This page has gone cold.');
}
$types = [
    'html' => 'text/html; charset=utf-8', 'css' => 'text/css; charset=utf-8',
    'js' => 'text/javascript; charset=utf-8', 'svg' => 'image/svg+xml',
    'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
    'webp' => 'image/webp', 'ico' => 'image/x-icon',
];
$extension = strtolower(pathinfo($real, PATHINFO_EXTENSION));
header('Content-Type: ' . ($types[$extension] ?? 'application/octet-stream'));
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
if (basename($real) === 'recovery.html') {
    header('Cache-Control: no-store');
}
readfile($real);
