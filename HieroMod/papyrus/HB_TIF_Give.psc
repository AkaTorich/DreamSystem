Scriptname HB_TIF_Give extends TopicInfo Hidden
{Фрагмент реплики «Переведёшь этот папирус?» — супруг(а) забирает книгу.}

HB_TransQuestScript Property QuestScript Auto

Function Fragment_0(ObjectReference akSpeakerRef)
    QuestScript.GiveBook(akSpeakerRef)
EndFunction
