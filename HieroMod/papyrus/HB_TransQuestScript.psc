Scriptname HB_TransQuestScript extends Quest
{Перевод папирусов супругом/супругой: приём книги, час игрового времени, выдача перевода.}

GlobalVariable Property HB_State Auto
{0 — заказа нет, 1 — перевод в работе, 2 — перевод готов}
FormList Property HB_Originals Auto
{Книги-папирусы (иероглифы), индекс совпадает с HB_Translations}
FormList Property HB_Translations Auto
{Книги-переводы на русском}

Int iBook = -1

Function GiveBook(ObjectReference akSpeaker)
    Actor player = Game.GetPlayer()
    Int i = 0
    While i < HB_Originals.GetSize()
        Form b = HB_Originals.GetAt(i)
        If player.GetItemCount(b) > 0
            player.RemoveItem(b, 1, false, akSpeaker)
            iBook = i
            HB_State.SetValue(1.0)
            RegisterForSingleUpdateGameTime(1.0)
            Return
        EndIf
        i += 1
    EndWhile
    Debug.Notification("Папируса при себе нет")
EndFunction

Event OnUpdateGameTime()
    If (HB_State.GetValue() as Int) == 1
        HB_State.SetValue(2.0)
        Debug.Notification("Перевод папируса готов")
    EndIf
EndEvent

Function TakeTranslation(ObjectReference akSpeaker)
    If iBook >= 0 && iBook < HB_Translations.GetSize()
        Game.GetPlayer().AddItem(HB_Translations.GetAt(iBook), 1)
    EndIf
    iBook = -1
    HB_State.SetValue(0.0)
EndFunction
