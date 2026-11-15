using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;
using System.Runtime.InteropServices;

namespace DreamMap
{
    public partial class MainWindow
    {
        /* ================= управление: пользователи, дары, доверие ================= */

        // строка-плашка списка (общая для всех трёх окон)
        Border Row(out StackPanel body)
        {
            body = new StackPanel { Orientation = Orientation.Horizontal };
            return new Border
            {
                CornerRadius = new CornerRadius(10), Padding = new Thickness(10, 7, 10, 7),
                Margin = new Thickness(0, 0, 0, 5), Background = new SolidColorBrush(Color.FromArgb(30, 147, 112, 255)),
                Child = body
            };
        }
        TextBlock Txt(string s, string brush = "TextBrush", double size = 13, double width = 0)
        {
            var t = new TextBlock
            {
                Text = s, FontSize = size, VerticalAlignment = VerticalAlignment.Center,
                FontFamily = new FontFamily("Segoe UI, Segoe UI Emoji"),
                Foreground = (Brush)FindResource(brush), TextTrimming = TextTrimming.CharacterEllipsis
            };
            if (width > 0) t.Width = width;
            return t;
        }
        Button SmallBtn(string content, string tip, RoutedEventHandler onClick, bool enabled = true)
        {
            var b = new Button
            {
                Style = (Style)FindResource("Ghost"), Content = content, ToolTip = tip,
                FontFamily = new FontFamily("Segoe UI, Segoe UI Emoji"),
                Margin = new Thickness(3, 0, 0, 0), IsEnabled = enabled,
                VerticalAlignment = VerticalAlignment.Center
            };
            b.Click += onClick;
            return b;
        }

        static string RoleName(string r)
        {
            return r == "owner" ? "владелец" : r == "admin" ? "админ"
                 : r == "moder" ? "модер" : "сновидец";
        }

        async void Users_Click(object sender, RoutedEventArgs e)
        {
            if (_site == null || _siteRole == null || RankOf(_siteRole) < 2)
            { Toast("Управление сновидцами доступно модерам и выше"); return; }
            UsersOverlay.Visibility = Visibility.Visible;
            PurgeInvitesBtn.Visibility = _siteRole == "owner" ? Visibility.Visible : Visibility.Collapsed;
            await RenderUsers();
            await RenderInvites();
        }
        void UsersClose_Click(object sender, RoutedEventArgs e) { UsersOverlay.Visibility = Visibility.Collapsed; }

        async Task RenderUsers()
        {
            UsersList.Children.Clear();
            try
            {
                var j = await _site.Get("users_list");
                int myRank = RankOf(_siteRole);
                foreach (Newtonsoft.Json.Linq.JObject u in (Newtonsoft.Json.Linq.JArray)j["users"])
                {
                    int uid = (int)u["id"];
                    string login = (string)u["login"], role = (string)u["role"];
                    bool me = uid == _siteUid;
                    // список уже отфильтрован сервером по ветке; людьми правит админ и выше
                    bool over = myRank >= 3 && myRank > RankOf(role);
                    bool banned = (int)u["banned"] == 1;
                    bool hasKey = (int)u["has_key"] == 1;

                    StackPanel body;
                    var row = Row(out body);
                    if (banned) row.Background = new SolidColorBrush(Color.FromArgb(30, 220, 80, 80));
                    body.Children.Add(Txt(MarkOf(role) + " " + login + (me ? "  (вы)" : ""), "TextBrush", 13.5, 190));
                    body.Children.Add(Txt(RoleName(role), "FaintBrush", 12, 80));
                    string par = (string)u["parent_login"];   // кто привёл — род виден сразу
                    body.Children.Add(Txt(string.IsNullOrEmpty(par) ? "корень" : "← " + par, "DimBrush", 11.5, 110));
                    body.Children.Add(Txt("💤 " + (int)u["dreams"], "FaintBrush", 12, 60));

                    if (over && !me)
                    {
                        var roles = new[] { "user", "moder", "admin" }
                            .Where(r => RankOf(r) < myRank).ToArray();
                        var cb = new ComboBox { Style = (Style)FindResource("Combo"), Width = 130,
                            VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(0, 0, 4, 0) };
                        foreach (var r in roles)
                        {
                            var it = new ComboBoxItem { Tag = r, Content = RoleName(r) };
                            cb.Items.Add(it);
                            if (r == role) cb.SelectedItem = it;
                        }
                        cb.SelectionChanged += async (s, ev) =>
                        {
                            var it = cb.SelectedItem as ComboBoxItem;
                            if (it == null || (string)it.Tag == role) return;
                            try { await _site.PostJson("user_set_role", new { id = uid, role = (string)it.Tag });
                                Toast("Роль изменена: " + login + " → " + RoleName((string)it.Tag));
                                await RenderUsers(); }
                            catch (Exception ex) { Toast(ex.Message); await RenderUsers(); }
                        };
                        body.Children.Add(cb);
                    }
                    else body.Children.Add(Txt("", "FaintBrush", 12, 134));

                    bool manage = (me || over) && myRank >= 3;
                    body.Children.Add(SmallBtn(hasKey ? "🤖✅" : "🤖",
                        hasKey ? "Доступ к ИИ есть — сменить или отозвать" : "Выдать доступ к ИИ",
                        async (s, ev) => await SetUserKey(uid, login, hasKey), manage));
                    body.Children.Add(SmallBtn("🔑", "Задать новый пароль",
                        async (s, ev) => await SetUserPass(uid, login), manage));
                    body.Children.Add(SmallBtn("✏", "Переименовать",
                        async (s, ev) => await RenameUser(uid, login), manage));
                    body.Children.Add(SmallBtn(banned ? "✅" : "🚫",
                        RankOf(role) >= 3 ? "Админа забанить нельзя" : (banned ? "Снять блокировку" : "Заблокировать вход"),
                        async (s, ev) => {
                            try { await _site.PostJson("user_ban", new { id = uid, banned = banned ? 0 : 1 });
                                Toast(banned ? "Разблокирован: " + login : "Заблокирован: " + login);
                                await RenderUsers(); }
                            catch (Exception ex) { Toast(ex.Message); }
                        }, !me && over && RankOf(role) < 3));
                    body.Children.Add(SmallBtn("🗑", "Удалить со всеми снами",
                        async (s, ev) => {
                            if (MessageBox.Show("Удалить сновидца «" + login + "» со всеми его снами и связями?",
                                "Карта снов", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
                            try { await _site.PostJson("user_delete", new { id = uid });
                                Toast("Удалён: " + login); await RenderUsers(); }
                            catch (Exception ex) { Toast(ex.Message); }
                        }, !me && over));
                    UsersList.Children.Add(row);
                }
            }
            catch (Exception ex) { UsersList.Children.Add(Txt("Список сновидцев: " + ex.Message, "FaintBrush")); }
        }

        async Task SetUserKey(int uid, string login, bool hasKey)
        {
            var res = MessageBox.Show(
                "Выдать «" + login + "» ВАШ ключ ИИ?" +
                (hasKey ? "\n(заменит текущий)" : "") +
                "\n\nДа — передать свой ключ одним нажатием.\nНет — вписать другой ключ" +
                (hasKey ? " или отозвать доступ." : "."),
                "Доступ к ИИ", MessageBoxButton.YesNoCancel, MessageBoxImage.Question);
            if (res == MessageBoxResult.Cancel) return;
            try
            {
                if (res == MessageBoxResult.Yes)
                {
                    await _site.PostJson("user_set_key", new { id = uid, use_mine = 1 });
                    Toast("Доступ к ИИ выдан — ваш ключ передан");
                }
                else
                {
                    string key = AskWindow.Text(this, "Доступ к ИИ",
                        hasKey ? "Ключ OpenRouter для «" + login + "» (пусто — отозвать доступ):"
                               : "Ключ OpenRouter для «" + login + "» (sk-or-v1-…):");
                    if (key == null) return;
                    await _site.PostJson("user_set_key", new { id = uid, key = key.Trim() });
                    Toast(key.Trim().Length > 0 ? "Доступ к ИИ выдан" : "Доступ отозван");
                }
                await RenderUsers();
            }
            catch (Exception ex) { Toast(ex.Message); }
        }

        async Task SetUserPass(int uid, string login)
        {
            string p = AskWindow.Text(this, "Пароль",
                "Новый пароль для «" + login + "» (от 6 символов):", "", true);
            if (string.IsNullOrEmpty(p)) return;
            try { await _site.PostJson("user_set_pass", new { id = uid, pass = p }); Toast("Пароль задан"); }
            catch (Exception ex) { Toast(ex.Message); }
        }

        async Task RenameUser(int uid, string login)
        {
            string n = AskWindow.Text(this, "Переименование", "Новый ник:", login);
            if (string.IsNullOrEmpty(n) || n == login) return;
            try { await _site.PostJson("user_rename", new { id = uid, login = n });
                Toast("Ник изменён: " + n); await RenderUsers(); }
            catch (Exception ex) { Toast(ex.Message); }
        }

        async Task RenderInvites()
        {
            InvitesList.Children.Clear();
            try
            {
                var j = await _site.Get("invites_list");
                var arr = (Newtonsoft.Json.Linq.JArray)j["invites"];
                if (arr.Count == 0)
                    InvitesList.Children.Add(Txt("Инвайтов пока нет — создайте первый.", "FaintBrush", 12.5));
                foreach (Newtonsoft.Json.Linq.JObject i in arr)
                {
                    bool used = i["used_at"] != null && i["used_at"].Type != Newtonsoft.Json.Linq.JTokenType.Null;
                    int iid = (int)i["id"];
                    string code = (string)i["code"];
                    StackPanel body;
                    var row = Row(out body);
                    var codeTb = Txt(code, used ? "FaintBrush" : "TextBrush", 13.5, 130);
                    if (!used)
                    {
                        codeTb.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#8FD8B8"));
                        codeTb.Cursor = Cursors.Hand;
                        codeTb.ToolTip = "Нажмите, чтобы скопировать";
                        codeTb.MouseLeftButtonUp += (s, ev) =>
                        { try { Clipboard.SetText(code); Toast("Скопировано: " + code); } catch { } };
                    }
                    body.Children.Add(codeTb);
                    string who = (string)i["used_login"];
                    bool gone = i["gone"] != null && (int)i["gone"] == 1;
                    var info = Txt(used
                        ? "использован: " + (string.IsNullOrEmpty(who) ? "неизвестно кем" : who)
                          + (gone ? "  · сновидец удалён" : "")
                        : "свободен · выдал " + (string)i["creator"], "FaintBrush", 12, 300);
                    if (gone) info.Foreground = new SolidColorBrush(
                        (Color)ColorConverter.ConvertFromString("#E08A8A"));
                    body.Children.Add(info);
                    body.Children.Add(SmallBtn("🗑", "Удалить неиспользованный",
                        async (s, ev) => {
                            try { await _site.PostJson("invite_del", new { id = iid }); await RenderInvites(); }
                            catch (Exception ex) { Toast(ex.Message); }
                        }, !used));
                    InvitesList.Children.Add(row);
                }
            }
            catch (Exception ex) { InvitesList.Children.Add(Txt("Инвайты: " + ex.Message, "FaintBrush")); }
        }

        async void InvitesPurge_Click(object sender, RoutedEventArgs e)
        {
            if (MessageBox.Show(
                "Убрать из списка ВСЕ использованные инвайты?\n\nСами сновидцы останутся — исчезнет лишь запись о входе.",
                "Очистка инвайтов", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
            try
            {
                var j = await _site.PostJson("invites_purge", new { });
                Toast("Убрано записей: " + (int)j["removed"]);
                await RenderInvites();
            }
            catch (Exception ex) { Toast(ex.Message); }
        }

        async void InviteCreate_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var j = await _site.PostJson("invite_create", new { });
                string code = (string)j["code"];
                try { Clipboard.SetText(code); Toast("Инвайт " + code + " скопирован в буфер"); }
                catch { Toast("Инвайт создан: " + code); }
                await RenderInvites();
            }
            catch (Exception ex) { Toast(ex.Message); }
        }

        /* ---- ларец даров ---- */
        async void Gifts_Click(object sender, RoutedEventArgs e)
        {
            if (_site == null || _siteRole == null) { Toast("Войдите в аккаунт (⛅ Сайт)"); return; }
            GiftsOverlay.Visibility = Visibility.Visible;
            await RenderGifts();
        }
        void GiftsClose_Click(object sender, RoutedEventArgs e) { GiftsOverlay.Visibility = Visibility.Collapsed; }

        static string ItemKind(string t)
        { return t == "book" ? "книга" : t == "pdf" ? "PDF" : "файл сюиты"; }

        // лик дара: своя иконка продукта, иначе знак его рода
        FrameworkElement GiftFace(Newtonsoft.Json.Linq.JObject g)
        {
            if ((int?)g["has_icon"] == 1)
            {
                try
                {
                    var bytes = _site.Download("api.php?action=gift_icon&id=" + (int)g["id"])
                        .GetAwaiter().GetResult();
                    var bi = new BitmapImage();
                    using (var ms = new System.IO.MemoryStream(bytes))
                    {
                        bi.BeginInit();
                        bi.CacheOption = BitmapCacheOption.OnLoad;
                        bi.StreamSource = ms;
                        bi.EndInit();
                    }
                    bi.Freeze();
                    return new Image { Source = bi, Width = 38, Height = 38,
                        Margin = new Thickness(0, 0, 10, 0), VerticalAlignment = VerticalAlignment.Top };
                }
                catch { }
            }
            string t = (string)g["item_type"];
            return new TextBlock
            {
                Text = t == "book" ? "𓏛" : t == "pdf" ? "📕" : "⚙",
                FontFamily = new FontFamily("Segoe UI Historic, Segoe UI Emoji, Segoe UI"),
                FontSize = 24, Width = 38, TextAlignment = TextAlignment.Center,
                Foreground = (Brush)FindResource("DimBrush"),
                Margin = new Thickness(0, 0, 10, 0), VerticalAlignment = VerticalAlignment.Top
            };
        }

        async Task RenderGifts()
        {
            GiftsList.Children.Clear();
            try
            {
                var j = await _site.Get("gifts_list");
                var inc = (Newtonsoft.Json.Linq.JArray)j["incoming"];
                var acc = (Newtonsoft.Json.Linq.JArray)j["accepted"];
                var outg = (Newtonsoft.Json.Linq.JArray)j["outgoing"];
                UpdateGiftBadge(inc.Count);

                GiftsList.Children.Add(SectLabel("ПРЕДЛОЖЕНЫ ВАМ"));
                if (inc.Count == 0) GiftsList.Children.Add(Txt("Новых даров нет.", "FaintBrush", 12.5));
                foreach (Newtonsoft.Json.Linq.JObject g in inc)
                {
                    int gid = (int)g["id"];
                    StackPanel body;
                    var row = Row(out body);
                    body.Children.Add(GiftFace(g));
                    var col = new StackPanel { Width = 350 };
                    col.Children.Add(Txt((string)g["title"] + "  ·  " + ItemKind((string)g["item_type"]), "TextBrush", 13.5));
                    string note = (string)g["note"];
                    if (!string.IsNullOrEmpty(note)) col.Children.Add(Txt(note, "DimBrush", 11.5));
                    string descr = (string)g["descr"];
                    if (!string.IsNullOrEmpty(descr))
                        col.Children.Add(new TextBlock
                        {
                            Text = descr, FontSize = 11.5, TextWrapping = TextWrapping.Wrap, MaxHeight = 52,
                            Foreground = (Brush)FindResource("FaintBrush"), Margin = new Thickness(0, 2, 0, 0)
                        });
                    string msg = (string)g["message"];
                    col.Children.Add(Txt("от " + (string)g["from_login"] +
                        (string.IsNullOrEmpty(msg) ? "" : "  — «" + msg + "»"), "FaintBrush", 12));
                    body.Children.Add(col);
                    body.Children.Add(SmallBtn("✓ Принять", "Принять дар на свою полку",
                        async (s, ev) => await DecideGift(gid, true)));
                    body.Children.Add(SmallBtn("✕", "Отклонить",
                        async (s, ev) => await DecideGift(gid, false)));
                    body.Children.Add(SmallBtn("🕳", "Скормить чёрной дыре: исчезнет и у дарителя",
                        async (s, ev) => await DevourGift(gid)));
                    GiftsList.Children.Add(row);
                }

                if (acc.Count > 0)
                {
                    GiftsList.Children.Add(SectLabel("ПРИНЯТЫЕ — МОЖНО СКОРМИТЬ ЧЁРНОЙ ДЫРЕ"));
                    foreach (Newtonsoft.Json.Linq.JObject g in acc)
                    {
                        int gid = (int)g["id"];
                        StackPanel body;
                        var row = Row(out body);
                        body.Children.Add(GiftFace(g));
                        var col2 = new StackPanel { Width = 430 };
                        col2.Children.Add(Txt((string)g["title"] + "  ·  от " + (string)g["from_login"], "TextBrush", 13));
                        string d2 = (string)g["descr"];
                        if (!string.IsNullOrEmpty(d2))
                            col2.Children.Add(new TextBlock
                            {
                                Text = d2, FontSize = 11.5, TextWrapping = TextWrapping.Wrap, MaxHeight = 34,
                                Foreground = (Brush)FindResource("FaintBrush")
                            });
                        body.Children.Add(col2);
                        body.Children.Add(SmallBtn("🕳", "Скормить чёрной дыре",
                            async (s, ev) => await DevourGift(gid)));
                        GiftsList.Children.Add(row);
                    }
                }

                if (outg.Count > 0)
                {
                    GiftsList.Children.Add(SectLabel("ВАШИ ДАРЫ"));
                    foreach (Newtonsoft.Json.Linq.JObject g in outg)
                    {
                        string st = (string)g["status"];
                        string mark = st == "accepted" ? "✓ принят" : st == "declined" ? "✕ отклонён"
                                    : st == "devoured" ? "🕳 поглощён" : "… ждёт решения";
                        StackPanel body;
                        var row = Row(out body);
                        body.Children.Add(Txt((string)g["title"] + "  →  " + (string)g["to_login"], "TextBrush", 13, 400));
                        body.Children.Add(Txt(mark, "FaintBrush", 12));
                        GiftsList.Children.Add(row);
                    }
                }
            }
            catch (Exception ex) { GiftsList.Children.Add(Txt("Ларец: " + ex.Message, "FaintBrush")); }
        }

        TextBlock SectLabel(string s)
        {
            return new TextBlock
            {
                Text = s, FontSize = 11, Margin = new Thickness(2, 12, 0, 6),
                Foreground = (Brush)FindResource("FaintBrush")
            };
        }

        async Task DecideGift(int id, bool accept)
        {
            try
            {
                await _site.PostJson("gift_decide", new { id = id, accept = accept ? 1 : 0 });
                Toast(accept ? "Дар принят — он на вашей полке" : "Дар отклонён");
                await RenderGifts();
                if (accept) await SyncBooksQuiet();
            }
            catch (Exception ex) { Toast(ex.Message); }
        }

        async Task DevourGift(int id)
        {
            try
            {
                await _site.PostJson("gift_devour", new { id = id });
                SpinBlackHole();
                Toast("🕳 Чёрная дыра поглотила дар");
                await RenderGifts();
            }
            catch (Exception ex) { Toast(ex.Message); }
        }

        // Чёрная дыра стоит спокойно и закручивается, только когда в неё падает дар:
        // вечное вращение заставляло окно перерисовываться без остановки
        void SpinBlackHole()
        {
            var a = new DoubleAnimation(0, 720, TimeSpan.FromSeconds(1.4))
            {
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut }
            };
            BhSpin.BeginAnimation(RotateTransform.AngleProperty, a);
        }

        void UpdateGiftBadge(int n)
        {
            GiftsBtn.Content = n > 0 ? "🎁 " + n : "🎁";
        }

        // тихо подтянуть книги/PDF после принятия дара
        async Task SyncBooksQuiet()
        {
            try
            {
                if (LibOverlay.Visibility == Visibility.Visible) RenderShelves();
            }
            catch { }
            await Task.Yield();
        }

        /* ---- доверие ---- */
        async void Trust_Click(object sender, RoutedEventArgs e)
        {
            if (_site == null || _siteRole == null) { Toast("Войдите в аккаунт (⛅ Сайт)"); return; }
            TrustOverlay.Visibility = Visibility.Visible;
            TrustLogin.Text = "";
            await RenderTrusts();
        }
        void TrustClose_Click(object sender, RoutedEventArgs e) { TrustOverlay.Visibility = Visibility.Collapsed; }

        async void TrustRequest_Click(object sender, RoutedEventArgs e)
        {
            string login = TrustLogin.Text.Trim();
            if (login.Length == 0) { Toast("Впишите логин сновидца"); return; }
            try
            {
                var j = await _site.PostJson("trust_request", new { login = login });
                Toast("Предложение доверия отправлено: " + (string)j["to"]);
                TrustLogin.Text = "";
                await RenderTrusts();
            }
            catch (Exception ex) { Toast(ex.Message); }
        }

        async Task RenderTrusts()
        {
            TrustList.Children.Clear();
            try
            {
                var j = await _site.Get("trusts_list");
                var arr = (Newtonsoft.Json.Linq.JArray)j["trusts"];
                if (arr.Count == 0)
                    TrustList.Children.Add(Txt("Связей доверия пока нет.", "FaintBrush", 12.5));
                foreach (Newtonsoft.Json.Linq.JObject t in arr)
                {
                    int tid = (int)t["id"];
                    string other = (string)t["other"], status = (string)t["status"];
                    bool incoming = (bool)t["incoming"];
                    bool accepted = status == "accepted";
                    bool auto = (int)t["my_auto"] == 1;

                    StackPanel body;
                    var row = Row(out body);
                    body.Children.Add(Txt(other, "TextBrush", 13.5, 180));
                    body.Children.Add(Txt(accepted ? "доверие" : incoming ? "просит доверия" : "ждёт ответа",
                        "FaintBrush", 12, 130));
                    if (incoming)
                    {
                        body.Children.Add(SmallBtn("✓ Принять", "Принять доверие",
                            async (s, ev) => await DecideTrust(tid, true)));
                        body.Children.Add(SmallBtn("✕", "Отклонить",
                            async (s, ev) => await DecideTrust(tid, false)));
                    }
                    else if (accepted)
                    {
                        body.Children.Add(SmallBtn(auto ? "⚡ автоприём вкл" : "автоприём выкл",
                            "Принимать дары от него без вопросов",
                            async (s, ev) => {
                                try { await _site.PostJson("trust_auto", new { id = tid, auto = auto ? 0 : 1 });
                                    await RenderTrusts(); }
                                catch (Exception ex) { Toast(ex.Message); }
                            }));
                    }
                    body.Children.Add(SmallBtn("🗑", "Отозвать доверие",
                        async (s, ev) => {
                            try { await _site.PostJson("trust_revoke", new { id = tid });
                                Toast("Доверие отозвано"); await RenderTrusts(); }
                            catch (Exception ex) { Toast(ex.Message); }
                        }));
                    TrustList.Children.Add(row);
                }
            }
            catch (Exception ex) { TrustList.Children.Add(Txt("Доверие: " + ex.Message, "FaintBrush")); }
        }

        async Task DecideTrust(int id, bool accept)
        {
            try
            {
                await _site.PostJson("trust_decide", new { id = id, accept = accept ? 1 : 0 });
                Toast(accept ? "Доверие принято" : "Предложение отклонено");
                await RenderTrusts();
            }
            catch (Exception ex) { Toast(ex.Message); }
        }
    }
}
