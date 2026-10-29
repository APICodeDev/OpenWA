// The country a phone number dials into, for a flag beside it. Like formatPhone, this reads the E.164
// country code off the leading digits rather than pulling in libphonenumber: WhatsApp numbers arrive
// digits-only with the code in place, and a flag is decoration, so a code shared by several countries
// (1 for the whole NANP) answers no country rather than a wrong one, unless the digits after the code
// fall in a range only one of them uses (see SHARED_CODES).

// Country code → ISO 3166-1 alpha-2 region. Codes are prefix-free, so the first match by length wins.
const REGION_BY_CODE: Record<string, string> = {
  // Two digits
  '20': 'EG',
  '27': 'ZA',
  '30': 'GR',
  '31': 'NL',
  '32': 'BE',
  '33': 'FR',
  '34': 'ES',
  '36': 'HU',
  '40': 'RO',
  '41': 'CH',
  '43': 'AT',
  '45': 'DK',
  '46': 'SE',
  '48': 'PL',
  '49': 'DE',
  '51': 'PE',
  '52': 'MX',
  '53': 'CU',
  '54': 'AR',
  '55': 'BR',
  '56': 'CL',
  '57': 'CO',
  '58': 'VE',
  '60': 'MY',
  '62': 'ID',
  '63': 'PH',
  '64': 'NZ',
  '65': 'SG',
  '66': 'TH',
  '81': 'JP',
  '82': 'KR',
  '84': 'VN',
  '86': 'CN',
  '90': 'TR',
  '91': 'IN',
  '92': 'PK',
  '93': 'AF',
  '94': 'LK',
  '95': 'MM',
  '98': 'IR',
  // Three digits: Africa and the Atlantic
  '211': 'SS',
  '213': 'DZ',
  '216': 'TN',
  '218': 'LY',
  '220': 'GM',
  '221': 'SN',
  '222': 'MR',
  '223': 'ML',
  '224': 'GN',
  '225': 'CI',
  '226': 'BF',
  '227': 'NE',
  '228': 'TG',
  '229': 'BJ',
  '230': 'MU',
  '231': 'LR',
  '232': 'SL',
  '233': 'GH',
  '234': 'NG',
  '235': 'TD',
  '236': 'CF',
  '237': 'CM',
  '238': 'CV',
  '239': 'ST',
  '240': 'GQ',
  '241': 'GA',
  '242': 'CG',
  '243': 'CD',
  '244': 'AO',
  '245': 'GW',
  '246': 'IO',
  '248': 'SC',
  '249': 'SD',
  '250': 'RW',
  '251': 'ET',
  '252': 'SO',
  '253': 'DJ',
  '254': 'KE',
  '255': 'TZ',
  '256': 'UG',
  '257': 'BI',
  '258': 'MZ',
  '260': 'ZM',
  '261': 'MG',
  '263': 'ZW',
  '264': 'NA',
  '265': 'MW',
  '266': 'LS',
  '267': 'BW',
  '268': 'SZ',
  '269': 'KM',
  // Tristan da Cunha also dials 290; ISO 3166-1 counts it, with Ascension, in Saint Helena's region.
  '290': 'SH',
  '291': 'ER',
  '297': 'AW',
  '298': 'FO',
  '299': 'GL',
  // Europe
  '350': 'GI',
  '351': 'PT',
  '352': 'LU',
  '353': 'IE',
  '354': 'IS',
  '355': 'AL',
  '356': 'MT',
  '357': 'CY',
  '359': 'BG',
  '370': 'LT',
  '371': 'LV',
  '372': 'EE',
  '373': 'MD',
  '374': 'AM',
  '375': 'BY',
  '376': 'AD',
  '377': 'MC',
  '378': 'SM',
  '379': 'VA',
  '380': 'UA',
  '381': 'RS',
  '382': 'ME',
  '383': 'XK',
  '385': 'HR',
  '386': 'SI',
  '387': 'BA',
  '389': 'MK',
  '420': 'CZ',
  '421': 'SK',
  '423': 'LI',
  // The Americas
  '500': 'FK',
  '501': 'BZ',
  '502': 'GT',
  '503': 'SV',
  '504': 'HN',
  '505': 'NI',
  '506': 'CR',
  '507': 'PA',
  '508': 'PM',
  '509': 'HT',
  '591': 'BO',
  '592': 'GY',
  '593': 'EC',
  '594': 'GF',
  '595': 'PY',
  '596': 'MQ',
  '597': 'SR',
  '598': 'UY',
  // Oceania and Asia
  '670': 'TL',
  '672': 'NF',
  '673': 'BN',
  '674': 'NR',
  '675': 'PG',
  '676': 'TO',
  '677': 'SB',
  '678': 'VU',
  '679': 'FJ',
  '680': 'PW',
  '681': 'WF',
  '682': 'CK',
  '683': 'NU',
  '685': 'WS',
  '686': 'KI',
  '687': 'NC',
  '688': 'TV',
  '689': 'PF',
  '690': 'TK',
  '691': 'FM',
  '692': 'MH',
  '850': 'KP',
  '852': 'HK',
  '853': 'MO',
  '855': 'KH',
  '856': 'LA',
  '880': 'BD',
  '886': 'TW',
  '960': 'MV',
  '961': 'LB',
  '962': 'JO',
  '963': 'SY',
  '964': 'IQ',
  '965': 'KW',
  '966': 'SA',
  '967': 'YE',
  '968': 'OM',
  '970': 'PS',
  '971': 'AE',
  '972': 'IL',
  '973': 'BH',
  '974': 'QA',
  '975': 'BT',
  '976': 'MN',
  '977': 'NP',
  '992': 'TJ',
  '993': 'TM',
  '994': 'AZ',
  '995': 'GE',
  '996': 'KG',
  '998': 'UZ',
};

// Codes several regions share, with the ranges (the digits after the code) that only one of them uses, from
// libphonenumber's metadata. A number in none of them answers no region: the rest of each plan is shared, such as the
// mobile ranges Svalbard, the Cocos and Christmas Islands, Aland, the Vatican and Western Sahara take from Norway,
// Australia, Finland, Italy and Morocco, or the ones Saint Barthelemy, Saint Martin and Guadeloupe share whole.
// Ranges are cut at five digits at most, and a few small territory blocks inside a shared range (some Cocos and
// Christmas exchanges in 8 51 and 8 91) leave that whole range unanswered; read the full patterns from libphonenumber
// if those flags are ever wanted.
const SHARED_CODES: Record<string, Array<[RegExp, string]>> = {
  // The whole NANP: the United States, Canada and the Caribbean.
  '1': [],
  // Kazakhstan took the 7 range of the Russian plan; 80 and 810 (toll-free, international) are both countries'.
  '7': [
    [/^7/, 'KZ'],
    [/^(?:[349]|8(?:[2-7]|1[1-8]))/, 'RU'],
  ],
  '39': [
    [/^06698/, 'VA'],
    [/^(?:0(?!6698|878)|4|7)/, 'IT'],
  ],
  // Jersey, Guernsey and the Isle of Man have their own landline codes and mobile blocks; the non-geographic ranges are
  // shared with the United Kingdom, and so is the 7924 mobile block.
  '44': [
    [/^(?:1534|7(?:509|700[378]|797|829|937))/, 'JE'],
    [/^(?:1481|7(?:781|839|911[17]))/, 'GG'],
    [/^(?:1624|7(?:4576|524|624))/, 'IM'],
    [/^(?:[12]|7(?!924)[1-57-9])/, 'GB'],
  ],
  '47': [
    [/^79/, 'SJ'],
    [/^(?:[2356]|7[0-8])/, 'NO'],
  ],
  '61': [
    [/^89162/, 'CC'],
    [/^89164/, 'CX'],
    [/^(?:[237]|8(?!51|91)|16)/, 'AU'],
  ],
  // Western Sahara's landlines (528 8 and 528 9) are in Morocco's plan too, so only Morocco's other ones answer.
  '212': [[/^5(?:[13-5]|2(?!8[89]))/, 'MA']],
  '262': [
    [/^(?:26(?:[23]|88)|69|7092)/, 'RE'],
    [/^(?:26(?:89|9)|639|7093)/, 'YT'],
  ],
  '358': [
    [/^18/, 'AX'],
    [/^(?:9|1[3-79]|[2356][1-8]|8[1-8])/, 'FI'],
  ],
  '590': [],
  // Bonaire, Sint Eustatius and Saba (3, 4 and 7) and Curacao (6 and 9).
  '599': [
    [/^[347]/, 'BQ'],
    [/^[69]/, 'CW'],
  ],
};

/** The region of a digits-only international number, or null when the code is unknown or its range shared. */
export function regionOfPhone(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (digits.length < 7) return null;
  // Codes are prefix-free, so the first length that names a shared code is the code.
  const shared = [1, 2, 3].find(length => digits.slice(0, length) in SHARED_CODES);
  if (shared) {
    const rest = digits.slice(shared);
    return SHARED_CODES[digits.slice(0, shared)].find(([range]) => range.test(rest))?.[1] ?? null;
  }
  return REGION_BY_CODE[digits.slice(0, 2)] ?? REGION_BY_CODE[digits.slice(0, 3)] ?? null;
}

/** The flag emoji of a region: its two letters as regional indicator symbols. */
export function flagOfRegion(region: string): string {
  return String.fromCodePoint(...[...region.toUpperCase()].map(letter => 0x1f1e6 + letter.charCodeAt(0) - 65));
}
