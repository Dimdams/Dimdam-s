const querystring = require("querystring");
const { request } = require("undici");
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 86400 });

const languages = require("./languages");
const tokenGenerator = require("./token");

/**
 * @function translate
 * @param {String} text
 * @param {Object} options
 * @returns {Object}
 */
async function translate(text, options) {
    if(typeof options !== "object") options = {};
    text = String(text);

    let error;
    [ options.from, options.to ].forEach((lang) => {
        if (lang && !languages.isSupported(lang)) {
            error = new Error();
            error.code = 400;
            error.message = `The language '${lang}' is not supported.`;
        }
    });
    if(error) throw error;

    let cacheKey = `${options.from}-${options.to}-${text}`;
    let cachedResult = cache.get(cacheKey);
    if(cachedResult){
        return cachedResult;
    }

    if(!Object.prototype.hasOwnProperty.call(options, "from")) options.from = "auto";
    if(!Object.prototype.hasOwnProperty.call(options, "to")) options.to = "fr";
    options.raw = Boolean(options.raw);

    options.from = languages.getISOCode(options.from);
    options.to = languages.getISOCode(options.to);

    let token = await tokenGenerator.generate(text);

    let baseUrl = "https://translate.google.com/translate_a/single";
    let data = {
        client: "gtx",
        sl: options.from,
        tl: options.to,
        hl: options.to,
        dt: [ "at", "bd", "ex", "ld", "md", "qca", "rw", "rm", "ss", "t" ],
        ie: "UTF-8",
        oe: "UTF-8",
        otf: 1,
        ssel: 0,
        tsel: 0,
        kc: 7,
        q: text,
        [token.name]: token.value
    };

    let url = `${baseUrl}?${querystring.stringify(data)}`;

    let requestOptions;
    if(url.length > 2048){
        delete data.q;
        requestOptions = [
            `${baseUrl}?${querystring.stringify(data)}`,
            {
                method: "POST",
                body: new URLSearchParams({ q: text }).toString(),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                },
            }
        ];
    }else{
        requestOptions = [ url ];
    }

    let response = await request(...requestOptions);
    let body = await response.body.json();

    let result = {
        text: "",
        from: {
            language: {
                didYouMean: false,
                iso: ""
            },
            text: {
                autoCorrected: false,
                value: "",
                didYouMean: false
            }
        },
        raw: ""
    };

    if(options.raw){
        result.raw = body;
    }

    body[0].forEach((obj) => {
        if(obj[0]){
            result.text += obj[0];
        }
    });

    if(body[2] === body[8][0][0]){
        result.from.language.iso = body[2];
    }else{
        result.from.language.didYouMean = true;
        result.from.language.iso = body[8][0][0];
    }

    if(body[7] && body[7][0]){
        let str = body[7][0];

        str = str.replace(/<b><i>/g, "[");
        str = str.replace(/<\/i><\/b>/g, "]");

        result.from.text.value = str;

        if(body[7][5] === true){
            result.from.text.autoCorrected = true;
        }else{
            result.from.text.didYouMean = true;
        }
    }

    cache.set(cacheKey, result);
    return result;
}

/**
 * @function loadLanguages
 * @param {Array<String>} languagesToLoad - The list of languages to load in the cache (in ISO 639-1)
 * @param {Array<String>} wordsToLoad - The list of words/phrases to load for each language
 * @returns {Promise}
 */
async function loadLanguages(languagesToLoad, wordsToLoad){
    if(!Array.isArray(languagesToLoad) || !Array.isArray(wordsToLoad)){
      throw new Error('Parameters must be arrays');
    }
  
    const translations = {};
    let langs = '';
    for(const lang of languagesToLoad){
        if(!languages.isSupported(lang)){
            throw new Error(`Language '${lang}' is not supported`);
        }
        langs += `${lang}, `
        translations[lang] = {};
    
        for(const word of wordsToLoad){
            const cacheKey = `${lang}-auto-${word}`;
            const cachedResult = cache.get(cacheKey);
    
            if(!cachedResult){
                const result = await translate(word, { to: lang });
                translations[lang][word] = result.text;
                cache.set(cacheKey, result);
            }else{
                translations[lang][word] = cachedResult.text;
            }
        }
    }
    
    langs = langs.slice(0, -2);
    console.log(`The languages "${langs}" have been loaded successfully.`)
    return translations;
}
  

module.exports = translate;
module.exports.languages = languages;
module.exports.loadLanguages = loadLanguages;