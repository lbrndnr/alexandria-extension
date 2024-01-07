import { TextItem } from "pdfjs-dist/types/src/display/api";

// helper function matching all urls in text
export function *iterateURLs(text: string): Generator<[number, number], void, void> {
    const re = /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/ig;
    iteratePattern(re, text);
}

// iterates over all regex matches, yields the start and end index
export function *iteratePattern(re: RegExp, text: string): Generator<[number, number], void, void> {
    let m;

    do {
        m = re.exec(text);
        if (m) {
            const e = re.lastIndex;
            const s = e-m[0].length;

            yield [s, e];
        }
    } while (m);
}

// returns the new string and the range of where the item was appended
export function appendTextItem(text: string, item: TextItem, appendNewLine: boolean): [string, [number, number]] {
    const s = text.length;
    let e = text.length + item.str.length;

    text += item.str;
    if (item.hasEOL) {
        if (appendNewLine) text += "\n";
        else if (text.endsWith("-")) {
            e -= 1;
            text = text.slice(0, -1);
        }
    }

    return [text, [s, e]];
}