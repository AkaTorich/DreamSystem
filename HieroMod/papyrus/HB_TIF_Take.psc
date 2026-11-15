Scriptname HB_TIF_Take extends TopicInfo Hidden
{Фрагмент реплики «Перевод готов?» — игрок получает русскую книгу.}

HB_TransQuestScript Property QuestScript Auto

Function Fragment_0(ObjectReference akSpeakerRef)
    QuestScript.TakeTranslation(akSpeakerRef)
EndFunction
