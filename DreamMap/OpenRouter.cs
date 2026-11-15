using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace DreamMap
{
    public class ModelInfo
    {
        public string Id;
        public bool Free;
        public bool OutText;
        public bool OutImage;
        public string PriceNote;
    }

    // Здесь только ПУБЛИЧНЫЙ список моделей (без ключа). Сами вызовы ИИ идут через сайт:
    // ключ OpenRouter хранится только в базе сервера и никогда не попадает в программу.
    public static class OpenRouter
    {
        static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromMinutes(3) };

        public static async Task<List<ModelInfo>> ListModels()
        {
            string txt = await Http.GetStringAsync("https://openrouter.ai/api/v1/models");
            var j = JObject.Parse(txt);
            var res = new List<ModelInfo>();
            foreach (var m in (JArray)j["data"])
            {
                string id = (string)m["id"];
                if (id == null) continue;
                var pricing = m["pricing"];
                double prompt = ParsePrice(pricing, "prompt");
                double completion = ParsePrice(pricing, "completion");
                double imgOut = ParsePrice(pricing, "image_output");
                bool varies = prompt < 0 || completion < 0;
                bool free = !varies && prompt == 0 && completion == 0 && imgOut == 0;

                bool outText = true, outImage = false;
                var arch = m["architecture"];
                var om = arch != null ? arch["output_modalities"] as JArray : null;
                if (om != null)
                {
                    outText = om.Any(x => x.ToString() == "text");
                    outImage = om.Any(x => x.ToString() == "image");
                }

                string note;
                if (free) note = "бесплатно";
                else if (varies) note = "платно · цена зависит от выбранного маршрута";
                else if (outImage && imgOut > 0)
                    note = "платно · ≈$" + Trim(imgOut * 1290) + "/картинка";
                else if (outImage)
                    note = "платно · цена генерации не указана";
                else note = "платно · $" + Trim(prompt * 1000000) + " вход / $" + Trim(completion * 1000000) + " выход за 1М токенов";

                res.Add(new ModelInfo { Id = id, Free = free, OutText = outText, OutImage = outImage, PriceNote = note });
            }
            res.Sort((a, b) => a.Free != b.Free ? (a.Free ? -1 : 1) : string.CompareOrdinal(a.Id, b.Id));
            return res;
        }

        static double ParsePrice(JToken pricing, string key)
        {
            if (pricing == null || pricing[key] == null) return 0;
            double v;
            return double.TryParse((string)pricing[key], System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out v) ? v : 0;
        }

        static string Trim(double v)
        {
            string fmt = v < 0.001 ? "0.#####" : v < 0.1 ? "0.###" : "0.##";
            return v.ToString(fmt, System.Globalization.CultureInfo.InvariantCulture);
        }
    }
}
