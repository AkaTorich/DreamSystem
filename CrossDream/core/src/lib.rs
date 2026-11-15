//! Ядро «Карты снов» (CrossDream) без Tauri: формы данных, хранилище профилей, шифр,
//! клиент сайта, синхронизация, разбор ИИ, перенос из старой программы.

pub mod books;
pub mod error;
pub mod jsonx;
pub mod legacy;
pub mod model;
pub mod ops;
pub mod pdfnet;
pub mod pipeline;
pub mod site;
pub mod store;
pub mod sync;
pub mod util;
pub mod vault;

pub use error::{Error, Result};
pub use model::{Analysis, Dream, Link, PdfBook, PlanetPos, Settings};
pub use site::SiteClient;
pub use store::Store;
pub use vault::Vault;
