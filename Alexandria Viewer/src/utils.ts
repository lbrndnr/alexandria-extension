import { TextItem } from "pdfjs-dist/types/src/display/api";

export class Rect {
    x1: number;
    x2: number;

    y1: number;
    y2: number;

    get width(): number { return this.x2 - this.x1; }
    get height(): number { return this.y2 - this.y1; }
    get coords(): [number, number][] {
        return [
            [this.x1, this.y1],
            [this.x1, this.y2],
            [this.x2, this.y1],
            [this.x2, this.y2]
        ];
    }
    get isUndefined(): boolean {
        return (this.x1 === undefined || this.x2 === undefined || this.y1 === undefined || this.y2 === undefined);
    }

    constructor(x1: number, x2: number, y1: number, y2: number) {
        this.x1 = x1;
        this.x2 = x2;
        this.y1 = y1;
        this.y2 = y2;
    }

    static undefined(): Rect {
        return new Rect(undefined, undefined, undefined, undefined);
    }

    encloseRect(rect: Rect) {
        for (const pt of rect.coords) {
            this.encloseCoordinates(pt[0], pt[1]);
        }
    }

    encloseCoordinates(x: number, y: number) {
        this.x1 = (this.x1 === undefined) ? x : Math.min(this.x1, x);
        this.x2 = (this.x2 === undefined) ? x : Math.max(this.x2, x);
        this.y1 = (this.y1 === undefined) ? y : Math.min(this.y1, y);
        this.y2 = (this.y2 === undefined) ? y : Math.max(this.y2, y);
    }

    overlapsWith(rect: Rect): boolean {
        return this.x1 < rect.x2 && this.x2 > rect.x1 && this.y1 < rect.y2 && this.y2 > rect.y1;
    }

    inset(x: number, y: number) {
        this.x1 += x;
        this.x2 -= x;
        this.y1 += y;
        this.y2 -= y;
    }

}

// helper function matching all urls in text
export function iterateURLs(text: string): Generator<[number, number], void, void> {
    const re = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/ig;
    return iteratePattern(re, text);
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
        else {
            if (text.endsWith("-")) {
                e -= 1;
                text = text.slice(0, -1);
            }
            e += 1;
            text += " ";
        }
    }

    return [text, [s, e]];
}

export function postprocessCitation(cit: string): string {
    // concatenate split up words
    const re = /-\n/g;
    cit = cit.replace(re, "");

    // tentatively, concat all lines to find urls
    const lines = cit.split("\n");
    let newCit = "";
    let i = 0, j = 0;
    for (const [s, e] of iterateURLs(lines.join(""))) {
        for (; i < lines.length; i++) {
            // if a url is detected across lines, don't add whitespace
            const sep = (j > s && j < e) ? "" : " ";

            newCit += sep + lines[i];
            j = newCit.length;
        }
    }

    // add remaining lines in case there wasn't a URL
    for (; i < lines.length; i++) {
        newCit += " " + lines[i];
    }

    return newCit.trim();
}