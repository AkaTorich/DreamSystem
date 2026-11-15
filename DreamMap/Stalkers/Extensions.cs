using System;
using System.Collections.Generic;

namespace DreamMap.Stalkers
{
    public static class Extensions
    {
        private static readonly Random Rng = new Random();

        public static void Shuffle<T>(this IList<T> list)
        {
            int n = list.Count;
            while (n > 1)
            {
                n--;
                int k = Rng.Next(n + 1);
                T value = list[k];
                list[k] = list[n];
                list[n] = value;
            }
        }

        public static void ShuffleMultiple<T>(this IList<T> list, int times)
        {
            for (int i = 0; i < times; i++)
            {
                list.Shuffle();
            }
        }
    }
}
