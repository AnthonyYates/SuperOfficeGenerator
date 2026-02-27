using SuperOffice.WebApi.Data;
using System;
using System.Collections.Generic;
using System.Text;

namespace SuperOfficeGenerator.Utils
{
    internal class SupportedLanguages
    {
        public Dictionary<string, string> Locales => _locales;
        Dictionary<string, string> _locales = new Dictionary<string, string>
        {
            { "af_ZA", "Afrikaans" },
            { "ar", "Arabic" },
            { "az", "Azerbaijani" },
            { "cz", "Czech" },
            { "de", "German" },
            { "de_AT", "German (Austria)" },
            { "de_CH", "German (Switzerland)" },
            { "el", "Greek" },
            { "en", "English" },
            { "en_AU", "English (Australia)" },
            //{ "en_AU_ocker", "English (Australia Ocker)" },
            { "en_BORK", "English (Bork)" },
            { "en_CA", "English (Canada)" },
            { "en_GB", "English (Great Britain)" },
            { "en_IE", "English (Ireland)" },
            { "en_IND", "English (India)" },
            { "en_NG", "Nigeria (English)" },
            { "en_US", "English (United States)" },
            { "en_ZA", "English (South Africa)" },
            { "es", "Spanish" },
            { "es_MX", "Spanish (Mexico)" },
            { "fa", "Farsi" },
            { "fi", "Finnish" },
            { "fr", "French" },
            { "fr_CA", "French (Canada)" },
            { "fr_CH", "French (Switzerland)" },
            { "ge", "Georgian" },
            { "hr", "Hrvatski" },
            { "id_ID", "Indonesia" },
            { "it", "Italian" },
            { "ja", "Japanese" },
            { "ko", "Korean" },
            { "lv", "Latvian" },
            { "nb_NO", "Norwegian" },
            { "ne", "Nepalese" },
            { "nl", "Dutch" },
            { "nl_BE", "Dutch (Belgium)" },
            { "pl", "Polish" },
            { "pt_BR", "Portuguese (Brazil)" },
            { "pt_PT", "Portuguese (Portugal)" },
            { "ro", "Romanian" },
            { "ru", "Russian" },
            { "sk", "Slovakian" },
            { "sv", "Swedish" },
            { "tr", "Turkish" },
            { "uk", "Ukrainian" },
            { "vi", "Vietnamese" },
            { "zh_CN", "Chinese" },
            { "zh_TW", "Chinese (Taiwan)" },
            { "zu_ZA", "Zulu (South Africa)" }
        };

    }
}
