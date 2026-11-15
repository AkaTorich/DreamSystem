<?php
function cfg() {
    static $c = null;
    if ($c === null) $c = require __DIR__ . '/../config.php';
    return $c;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $d = cfg()['db'];
        $pdo = new PDO(
            "mysql:host={$d['host']};dbname={$d['name']};charset=utf8mb4",
            $d['user'], $d['pass'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
             PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    }
    return $pdo;
}

function q(string $sql, array $p = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st;
}

function json_out($data, int $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400) {
    json_out(['error' => $msg], $code);
}
