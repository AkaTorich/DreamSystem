//! Миниатюры картинок снов: путь по локальному имени, уборка лишних, удаление вместе с картинкой.

use dream_core::model::Dream;
use dream_core::store::Store;
use dream_core::sync::thumbs;
use std::path::PathBuf;

fn tmp(name: &str) -> PathBuf {
    let p = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name).join(dream_core::util::rand_name(""));
    std::fs::create_dir_all(&p).unwrap();
    p
}

fn dream(id: &str, img: &str) -> Dream {
    Dream { id: id.into(), image_file: img.into(), ..Default::default() }
}

#[test]
fn thumbs_live_by_image_name_and_get_pruned() {
    let st = Store::open(&tmp("thumbs"), "tester").unwrap();
    assert!(st.thumb_file("").is_none());
    st.save_thumb("a1.jpg", b"RIFF0000WEBPxx").unwrap();
    st.save_thumb("b2.webp", b"RIFF0000WEBPxx").unwrap();
    assert!(st.thumb_path("b2.webp").ends_with("b2.webp.webp"));
    assert!(st.thumb_file("a1.jpg").is_some());

    // картинка сна сменилась: у сна теперь b2.webp — миниатюра a1.jpg лишняя
    thumbs::prune(&st, &[dream("d1", "b2.webp")]);
    assert!(st.thumb_file("a1.jpg").is_none());
    assert!(st.thumb_file("b2.webp").is_some());

    // сон удалён: картинка ни у кого — уходит и миниатюра
    st.drop_image_if_unused("b2.webp", &[]);
    assert!(st.thumb_file("b2.webp").is_none());
}
