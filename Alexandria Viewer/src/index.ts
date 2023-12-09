import * as pl from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import * as pv from "pdfjs-dist/web/pdf_viewer";
import { XMLParser } from "fast-xml-parser";
import { AcademicDocumentProxy } from "./doc";

pl.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/build/pdf.worker.entry");

var VIEWER: PDFViewer = null;
var SCALE_VALUE = "page-width";

if (document.contentType == "application/pdf") {
    addEventListeners();
}

export class PDFViewer {

    url: String
    doc: AcademicDocumentProxy
    container: HTMLDivElement;
    viewer: pv.PDFViewer | undefined;

    constructor(url: String, container: HTMLDivElement) {
        this.url = url;
        this.container = container;
    }

    async reload() {
        const pdf = await pl.getDocument(this.url).promise;
        this.doc = new AcademicDocumentProxy(pdf);

        const eventBus = new pv.EventBus();
        const linkService = new pv.PDFLinkService({
            eventBus,
            externalLinkRel: "noopener noreferrer nofollow",
            externalLinkTarget: pv.LinkTarget.BLANK
        });	
        this.viewer = new pv.PDFViewer({
            container: this.container,
            eventBus,
            linkService,
            l10n: pv.NullL10n
        });

        this.viewer.setDocument(pdf);
        linkService.setViewer(this.viewer);
        linkService.setDocument(pdf);

        eventBus.on("pagesinit", () => {
            this.viewer.currentScaleValue = "page-width";
        });

        const title = this.doc.loadTitle();
        const authors = title.then((title) => {
            this._setDocumentTitle(title);
            return getAuthors(title);
        });
        const titleAndAuthors = Promise.all([title, authors]);
        const refs = this.doc.loadSection("References");

        eventBus.on("annotationlayerrendered", (event: any) => {
            titleAndAuthors.then(res => {
                const [title, authors] = res;

                this._addLinkToText(title, googleScholarQueryURL(title), event.pageNumber, "Search on Google Scholar");
                for (const author of authors) {
                    this._addLinkToText(author, googleScholarQueryURL(author), event.pageNumber, "Search on Google Scholar");
                }
            });

            refs.then(refs => {
                var keywordToCitation = new Map();
                var keyword = null;
                var j = 0;
                for (var i = 0; i < refs.length; i++) {
                    if (refs[i] == "[") {
                        if (keyword !== null) {
                            const cit = refs.substring(j+1, i);
                            keywordToCitation.set(keyword, cit.trim());
                            keyword = null;
                        }
                        j = i;
                    }
                    else if (refs[i] == "]") {
                        keyword = refs.substring(j+1, i);
                        j = i;
                    }
                }

                keywordToCitation.forEach((citation, keyword) => {
                    this._addLinkToText(keyword, googleScholarQueryURL(citation), event.pageNumber, citation);
                });
            });
        });
    }

    private _setDocumentTitle(text: string) {
        // In case we're in an iframe, set the top document's title too
        top.document.title = text;

        const title = document.createElement("title");
        title.innerText = text;

        const head = document.createElement("head");
        head.appendChild(title);

        document.body.insertAdjacentElement("beforebegin", head);
    }

    private async _addLinkToText(str: string, url: string, pageIdx: number, tooltip: string) {
        const als = document.getElementsByClassName("annotationLayer");
        if (als.length < pageIdx) return;

        const annotationLayer = als[pageIdx-1] as HTMLElement;
        annotationLayer.hidden = false;

        var text = "";
        var idx: number[] = [];
        var items: TextItem[] = [];

        const page = await this.doc.pdf.getPage(pageIdx);
        const textContent = await page.getTextContent();
    
        for (const elem of textContent.items) {
            const item = elem as TextItem;
            if (item.str.length == 0) continue;

            items.push(item);
            idx.push(text.length);
            text += item.str + " ";
            text = this._normalize(text);
        }

        const k = text.indexOf(str);
        if (k >= 0) {            
            idx.forEach((i, j) => {
                if (i >= k && i < k + str.length) {
                    const item = items[j];

                    const a = document.createElement("a");
                    a.setAttribute("title", tooltip);
                    a.setAttribute("id", "alexandria-url-google-scholar");
                    a.setAttribute("href", url);
                    a.setAttribute("target", "_blank");

                    const pageHeight = page.view[3] - page.view[1];
                    const top = pageHeight - (item.transform[5] + item.height);
                    const section = document.createElement("section");
                    section.style.zIndex = "10";
                    section.style.left = `calc(var(--scale-factor)*${item.transform[4]}px)`;
                    section.style.top = `calc(var(--scale-factor)*${top}px)`;
                    section.style.height = `calc(var(--scale-factor)*${item.height}px)`;
                    section.style.width = `calc(var(--scale-factor)*${item.width}px)`;
                    section.setAttribute("class", "linkAnnotation");
                    section.appendChild(a);

                    annotationLayer.appendChild(section);
                }
            });
        }
    }

    _normalize(str: string): string {
        return str.replace(/\s+/g, " ");
    }

}

function googleScholarQueryURL(text: string): string {
    const query = encodeURIComponent(text);
    return `https://scholar.google.com/scholar?q=${query}`;
}

async function getAuthors(title: string): Promise<string[] | null> {
    const query = encodeURIComponent(title.replace(":", " "));
    const url = `https://export.arxiv.org/api/query?search_query=${query}`;

    const res = await fetch(url);
    const text = await res.text();
    const parser = new XMLParser();
    const body = parser.parse(text);
    for (const entry of body.feed.entry) {
        const asdf = entry.title.replace(/\s+/g, " ");

        if (asdf.toLowerCase() == title.toLowerCase()) {
            return entry.author.map((a: any) => { return a.name });
        }
    }

    return [];
}

function addEventListeners() {
    document.addEventListener("DOMContentLoaded", (_) => {
        const container = prepareBody();    
        const url = window.location.href;
        VIEWER = new PDFViewer(url, container);
        VIEWER.reload();
    });   

    document.addEventListener("keypress", (event) => {
        switch (event.key) {
            case "s": {
                const url = googleScholarQueryURL(top.document.title);
                window.open(url, "_blank");
                break;
            }
            case "i": {
                const cls = "inverted-color";
                if (VIEWER.container.classList.contains(cls)) {
                    VIEWER.container.classList.remove(cls)
                }
                else {
                    VIEWER.container.classList.add(cls);
                }
                break;
            }
            case "8": setScaleValue("page-fit"); break;
            case "9": setScaleValue("page-width"); break;
            case "0": setScaleValue("auto"); break;
        }
    });

    window.onresize = (event) => {
        VIEWER.viewer.currentScaleValue = SCALE_VALUE;
    };
}

function setScaleValue(value: string) {
    SCALE_VALUE = value;
    VIEWER.viewer.currentScaleValue = value;
}

export function prepareBody(): HTMLDivElement {
    const viewer = document.createElement("div");
    viewer.setAttribute("class", "pdfViewer");
    
    const container = document.createElement("div");
    container.setAttribute("id", "alexandria-pdf-container");
    container.appendChild(viewer);

    document.body.appendChild(container);

    return container;
}