namespace MichalMalenda.github.io
{
    using System.Net.Http;
    using System.Net.Http.Json;
    using System.Threading.Tasks;
    public class MtgService
    {
        private readonly HttpClient _httpClient;
        public Card[] Cards { get; set; }
        public MtgService(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }

        public async Task<Card[]> SearchCardsAsync(string query)
        {
            var response = await _httpClient.GetFromJsonAsync<Card[]>($"https://api.magicthegathering.io/v1/cards?name={query}");
            return response;
        }
    }

    public class Card
    {
        public string Name { get; set; }
        public string ImageUrl { get; set; }
    }

}
