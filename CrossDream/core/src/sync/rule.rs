//! Правило «новее — главнее» по серверным штампам времени (с допуском в 1 секунду).

use crate::util::parse_time;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Winner {
    /// своё новее — отправить на сайт
    Local,
    /// сайт новее — взять с сайта
    Site,
    /// равны или решать нечего
    Same,
}

/// `*_has` — есть ли значение на стороне; `*_time` — штамп правки ("YYYY-MM-DD HH:MM:SS", UTC).
/// Значение без штампа уступает значению со штампом только если у той стороны значения нет.
pub fn decide(local_has: bool, local_time: Option<&str>, site_has: bool, site_time: Option<&str>) -> Winner {
    let lt = local_time.and_then(parse_time);
    let st = site_time.and_then(parse_time);
    // a новее b: у a есть штамп и (у b штампа нет либо a позже b больше чем на секунду)
    let newer = |a: Option<i64>, b: Option<i64>| match a {
        Some(a) => b.map_or(true, |b| a > b + 1),
        None => false,
    };
    let local_newer = local_has && (!site_has || newer(lt, st));
    let site_newer = site_has && (!local_has || newer(st, lt));
    if local_newer {
        Winner::Local
    } else if site_newer {
        Winner::Site
    } else {
        Winner::Same
    }
}
