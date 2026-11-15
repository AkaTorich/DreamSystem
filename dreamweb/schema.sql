-- Карта снов · веб-движок
-- mysql -u root -p < schema.sql   (или выполнить в phpMyAdmin)

CREATE DATABASE IF NOT EXISTS dreammap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dreammap;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  login VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(190) NULL UNIQUE,   -- для восстановления доступа; необязательна
  pass_hash VARCHAR(255) NOT NULL,
  role ENUM('user','moder','admin','owner') NOT NULL DEFAULT 'user',
  parent_id INT NULL,   -- кто привёл: владелец инвайта; у корня (владельца) пусто
  banned TINYINT(1) NOT NULL DEFAULT 0,
  openrouter_key VARCHAR(255) NOT NULL DEFAULT '',
  key_issued TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = ключ выдан админом (пользователь его не видит)
  text_model VARCHAR(128) NOT NULL DEFAULT 'google/gemini-2.5-flash',
  image_model VARCHAR(128) NOT NULL DEFAULT 'google/gemini-2.5-flash-image',
  gen_images TINYINT(1) NOT NULL DEFAULT 1,
  last_ip VARCHAR(45) NOT NULL DEFAULT '',  -- последний адрес посетителя (только последний)
  colors TEXT NULL,  -- личная палитра: цвета нитей и сфер
  map_zoom FLOAT NULL,  -- (устарело, оставлено для совместимости)
  map_view TEXT NULL,   -- личный вид карты: {zoom, yaw, pitch}
  view_time DATETIME NULL,  -- время правки вида: новее — главнее
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- дефолтный владелец: admin / admin123 (смените пароль после первого входа)
-- Иерархия двойная: ранг (owner > admin > moder > user) И род — кто кого привёл по инвайту
-- (users.parent_id). Управлять можно лишь тем, кто ниже рангом И растёт из твоей ветки.
INSERT IGNORE INTO users (login, pass_hash, role)
VALUES ('admin', '$2y$10$OLTb3Q2.C./4jqF8JabT8uWPeHXAK.ZeHJB4b4CoR0JFcC0J6/6L.', 'owner');

CREATE TABLE dreams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ext_id VARCHAR(64) NOT NULL DEFAULT '',      -- id из настольной программы (для импорта без дублей)
  title VARCHAR(255) NOT NULL DEFAULT 'Сон без имени',
  dream_date DATE NULL,
  text MEDIUMTEXT,
  summary TEXT,
  location VARCHAR(500) NOT NULL DEFAULT '',
  characters TEXT,      -- JSON-массивы строк
  emotions TEXT,
  symbols TEXT,
  motifs TEXT,
  image_prompt TEXT,
  image_file VARCHAR(255) NOT NULL DEFAULT '',
  pos_x FLOAT NULL, pos_y FLOAT NULL, pos_z FLOAT NULL,  -- авторские координаты на сфере
  pos_time DATETIME NULL,  -- время последней правки позиции: новее — главнее
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (user_id), INDEX (ext_id)
) ENGINE=InnoDB;

-- Библиотеки: у каждого сновидца своя. Вышестоящие по иерархии видят библиотеки
-- нижестоящих и могут передавать книги вниз (копией).
CREATE TABLE books (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  num INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  text MEDIUMTEXT,
  translation MEDIUMTEXT,
  seal VARCHAR(64) NOT NULL DEFAULT '',  -- печать книги: только на сервере, неизменяемая
  location VARCHAR(500) NOT NULL DEFAULT '',  -- фундамент: книга подпирает планету-локацию
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_num (user_id, num),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Инвайты: регистрация только по коду; коды создают админ и владелец.
CREATE TABLE invites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  created_by INT NOT NULL,
  used_by INT NULL,
  used_login VARCHAR(64) NOT NULL DEFAULT '',  -- ник помнится и после удаления сновидца
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Полки-папки: у каждого свои; в них раскладываются книги, PDF и файлы сюиты.
-- У каждой вкладки папки свои: kind = book | pdf | file.
-- folder_id = NULL значит «на общей полке, вне папок».
CREATE TABLE folders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  kind ENUM('book','pdf','file') NOT NULL DEFAULT 'book',
  parent_id INT NULL,             -- папка внутри папки (вложенность любая); NULL — на полке
  name VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id), INDEX (parent_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- PDF-библиотеки: та же иерархия, что у книг; в Писца и игру не попадают.
CREATE TABLE pdf_books (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ext_id VARCHAR(64) NOT NULL DEFAULT '',   -- id из программы (для синхронизации)
  title VARCHAR(255) NOT NULL,
  file VARCHAR(255) NOT NULL,               -- имя файла в uploads/pdf (может делиться при передаче)
  last_page INT NOT NULL DEFAULT 0,         -- последняя открытая страница у этого читателя (с 1)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Дары: единственная дверь в чужой космос — предложение, которое можно отклонить.
CREATE TABLE gifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_user INT NOT NULL, to_user INT NOT NULL,
  item_type ENUM('book','pdf','file') NOT NULL, item_id INT NOT NULL,
  message VARCHAR(255) NOT NULL DEFAULT '',
  status ENUM('pending','accepted','declined','devoured') NOT NULL DEFAULT 'pending',
  copy_id INT NULL,   -- копия на полке получателя: её пожирает чёрная дыра
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at DATETIME NULL,
  INDEX (to_user), INDEX (from_user),
  FOREIGN KEY (from_user) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (to_user) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Доверие: взаимное, отзываемое; открывает дарение между любыми сновидцами.
CREATE TABLE trusts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  a_user INT NOT NULL, b_user INT NOT NULL,   -- a — предложивший
  status ENUM('pending','accepted') NOT NULL DEFAULT 'pending',
  auto_a TINYINT(1) NOT NULL DEFAULT 0,       -- a автоматически принимает дары от b
  auto_b TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_pair (a_user, b_user),
  FOREIGN KEY (a_user) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (b_user) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Файлы сюиты «Гермес»: скомпилированные творения; выкладывает владелец, передаются вниз.
CREATE TABLE suite_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  file VARCHAR(255) NOT NULL,
  size INT NOT NULL DEFAULT 0,
  icon VARCHAR(191) NOT NULL DEFAULT '',  -- иконка продукта (ico/png из папки проекта)
  descr TEXT NOT NULL,                    -- описание продукта
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Глобальные связи книг: иероглифические, PDF и сны, свои и чужие (по иерархии доступа).
-- Сон со сном так не связывается — для этого нити карты (links).
CREATE TABLE book_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  a_type ENUM('book','pdf','dream') NOT NULL, a_id INT NOT NULL,
  b_type ENUM('book','pdf','dream') NOT NULL, b_id INT NOT NULL,
  reason VARCHAR(255) NOT NULL DEFAULT '',
  created_by INT NULL,
  UNIQUE KEY uniq_pair (a_type, a_id, b_type, b_id)
) ENGINE=InnoDB;

-- Связи. Внутри одной карты и мосты между картами разных сновидцев (их создаёт админ).
CREATE TABLE links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dream_a INT NOT NULL,
  dream_b INT NOT NULL,
  type VARCHAR(20) NOT NULL,                   -- локация|персонаж|эмоция|символ|сюжет
  reason TEXT,
  created_by INT NULL,
  UNIQUE KEY uniq_pair (dream_a, dream_b, type),
  FOREIGN KEY (dream_a) REFERENCES dreams(id) ON DELETE CASCADE,
  FOREIGN KEY (dream_b) REFERENCES dreams(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- восстановление доступа по почте: одноразовые ссылки на час (хранится только хеш)
CREATE TABLE pass_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  ip VARCHAR(45) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY (user_id), KEY (ip, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
