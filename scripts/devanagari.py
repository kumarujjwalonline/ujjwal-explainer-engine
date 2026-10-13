"""Tiny Devanagari -> Latin phonetic converter used by the audio check (no dependencies).

roman("फैट") -> "fait", roman("फट") -> "fat", vowels("फैट") -> "ai", vowels("फट") -> "a"
Final inherent 'a' is dropped (schwa deletion), nukta and candrabindu are ignored.
"""
import re

CONS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "f", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "ळ": "l", "व": "v",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h",
}
NUKTA = {"क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f"}
# Vowel classes are coarse on purpose: speech recognition spells long/short i and u inconsistently.
MATRA = {"ा": "aa", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "aw", "ॅ": "ai"}
VOWEL = {"अ": "a", "आ": "aa", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "aw", "ऍ": "ai"}
VIRAMA, NUKTA_SIGN = "्", "़"


def roman(word):
    out = []
    chars = list(word)
    i = 0
    while i < len(chars):
        c = chars[i]
        if c in CONS:
            base = CONS[c]
            j = i + 1
            if j < len(chars) and chars[j] == NUKTA_SIGN:
                base = NUKTA.get(c, base)
                j += 1
            if j < len(chars) and chars[j] == VIRAMA:
                out.append(base)
                j += 1
            elif j < len(chars) and chars[j] in MATRA:
                out.append(base + MATRA[chars[j]])
                j += 1
            else:
                out.append(base + "a")
            i = j
            continue
        if c in VOWEL:
            out.append(VOWEL[c])
        elif c in "ंँ":
            out.append("n")
        elif c == "ः":
            out.append("h")
        elif c.isascii() and c.isalpha():
            out.append(c.lower())
        i += 1
    s = "".join(out)
    if len(s) > 2 and s.endswith("a") and not s.endswith("aa") and re.search(r"[^aeiou]a$", s) and any(ch in CONS for ch in word[-1:]):
        s = s[:-1]  # schwa deletion at the end of a word
    return s


def is_devanagari(word):
    return bool(re.search(r"[ऀ-ॿ]", word))


def vowels(word):
    """Sequence of vowel classes in a Devanagari word, e.g. 'फैट' -> ['ai'] (final schwa dropped)."""
    out = []
    chars = list(word)
    i = 0
    while i < len(chars):
        c = chars[i]
        if c in CONS:
            j = i + 1
            if j < len(chars) and chars[j] == NUKTA_SIGN:
                j += 1
            if j < len(chars) and chars[j] == VIRAMA:
                j += 1
            elif j < len(chars) and chars[j] in MATRA:
                out.append(MATRA[chars[j]])
                j += 1
            else:
                out.append("a" if j < len(chars) else "")  # inherent vowel; none at the end
            i = j
            continue
        if c in VOWEL:
            out.append(VOWEL[c])
        i += 1
    return [v for v in out if v]
