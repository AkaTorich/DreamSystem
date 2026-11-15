using System.Collections.Generic;

namespace DreamMap.Stalkers
{
    public class MergeOperation
    {
        public int Number { get; set; }
        public List<Card> Cards { get; set; }

        public MergeOperation(int number, List<Card> cards)
        {
            Number = number;
            Cards = cards;
        }
    }
}
