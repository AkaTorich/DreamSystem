using System;
using System.Windows;
using System.Windows.Media.Animation;
using System.Windows.Threading;

namespace DreamMap
{
    /* Строка состояния внизу окна: что сейчас делает синхронизация и полоса её хода.
       Синхронизации вкладываются друг в друга («всё» = сны + книги + …): общую полосу
       ведёт внешняя, а каждый шаг занимает свой кусок (SyncPart) и сообщает долю внутри него. */
    public partial class MainWindow
    {
        int _syncNest;                        // сколько синхронизаций сейчас вложено одна в другую
        double _syncFrom, _syncTo = 1;        // кусок общей полосы, отданный текущему шагу
        string _syncError;                    // первая ошибка за проход — её и покажем в конце
        DispatcherTimer _syncHideTimer;

        void SyncBegin(string what)
        {
            if (_syncNest++ > 0) return;      // вложенный вызов — полосу ведёт внешний
            _syncFrom = 0; _syncTo = 1; _syncError = null;
            if (_syncHideTimer != null) _syncHideTimer.Stop();
            SyncBar.BeginAnimation(OpacityProperty, null);
            SyncBar.Opacity = 1;
            SyncBar.Value = 0;
            SyncBar.Visibility = Visibility.Visible;
            SyncPct.Visibility = Visibility.Visible;
            SyncPct.Text = "0 %";
            StatusText.Text = what + "…";
        }

        // следующий шаг займёт кусок полосы от from до to (доли от 0 до 1)
        void SyncPart(double from, double to) { _syncFrom = from; _syncTo = to; }

        // что делается сейчас и сколько пройдено внутри текущего шага (0..1)
        void SyncStep(string text, double frac)
        {
            if (_syncNest == 0) return;
            frac = Math.Max(0, Math.Min(1, frac));
            double v = (_syncFrom + (_syncTo - _syncFrom) * frac) * 100;
            if (v > SyncBar.Value) SyncBar.Value = v;      // полоса идёт только вперёд
            SyncPct.Text = (int)SyncBar.Value + " %";
            StatusText.Text = text;
        }

        void SyncFail(string text) { if (_syncError == null) _syncError = text; }

        void SyncEnd()
        {
            if (_syncNest == 0 || --_syncNest > 0) return;
            if (_syncError != null)
            {
                StatusText.Text = "⚠ " + _syncError;
                SyncBar.Visibility = Visibility.Collapsed;
                SyncPct.Visibility = Visibility.Collapsed;
                return;
            }
            SyncBar.Value = 100;
            SyncPct.Text = "100 %";
            StatusText.Text = "✓ синхронизировано в " + DateTime.Now.ToString("HH:mm");
            // полоса гаснет чуть погодя, чтобы было видно, что дошла до конца
            if (_syncHideTimer == null)
            {
                _syncHideTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1.5) };
                _syncHideTimer.Tick += (s, e) =>
                {
                    _syncHideTimer.Stop();
                    var fade = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(400));
                    fade.Completed += (s2, e2) =>
                    {
                        if (_syncNest > 0) return;
                        SyncBar.Visibility = Visibility.Collapsed;
                        SyncPct.Visibility = Visibility.Collapsed;
                    };
                    SyncBar.BeginAnimation(OpacityProperty, fade);
                };
            }
            _syncHideTimer.Stop(); _syncHideTimer.Start();
        }
    }
}
