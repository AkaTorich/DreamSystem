using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace DreamMap
{
    // Клиент веб-движка dreamweb: логин по сессии, сны, книги, пользователи.
    public class SiteClient
    {
        readonly HttpClient _http;
        readonly string _base;

        public SiteClient(string baseUrl)
        {
            _base = baseUrl.TrimEnd('/');
            var h = new HttpClientHandler { CookieContainer = new CookieContainer(), UseCookies = true };
            _http = new HttpClient(h) { Timeout = TimeSpan.FromMinutes(5) };
        }

        async Task<JObject> Call(string actionAndParams, HttpContent content)
        {
            string url = _base + "/api.php?action=" + actionAndParams;
            var r = content == null ? await _http.GetAsync(url) : await _http.PostAsync(url, content);
            string txt = await r.Content.ReadAsStringAsync();
            JObject j;
            try { j = JObject.Parse(txt); }
            catch { throw new Exception("Сервер вернул не-JSON (HTTP " + (int)r.StatusCode + ")"); }
            if (j["error"] != null) throw new Exception((string)j["error"]);
            return j;
        }

        public Task<JObject> Get(string actionAndParams)
        {
            return Call(actionAndParams, null);
        }

        public Task<JObject> PostJson(string action, object body)
        {
            return Call(action, new StringContent(
                JsonConvert.SerializeObject(body), Encoding.UTF8, "application/json"));
        }

        public Task<byte[]> Download(string relPath)
        {
            return _http.GetByteArrayAsync(_base + "/" + relPath);
        }

        public async Task<JObject> Upload(string action, string fileField, string fileName,
            byte[] data, List<Tuple<string, byte[]>> images = null,
            Dictionary<string, string> fields = null, string mime = "application/json")
        {
            var mp = new MultipartFormDataContent();
            var f = new ByteArrayContent(data);
            f.Headers.ContentType = new MediaTypeHeaderValue(mime);
            mp.Add(f, fileField, fileName);
            if (fields != null)
                foreach (var kv in fields)
                    mp.Add(new StringContent(kv.Value, Encoding.UTF8), kv.Key);
            if (images != null)
                foreach (var im in images)
                {
                    var c = new ByteArrayContent(im.Item2);
                    c.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
                    mp.Add(c, "images[]", im.Item1);
                }
            return await Call(action, mp);
        }
    }
}
