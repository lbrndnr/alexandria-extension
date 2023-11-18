import * as pl from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import * as pv from "pdfjs-dist/web/pdf_viewer";
import { XMLParser } from "fast-xml-parser";

pl.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/build/pdf.worker.entry");

var gpdf: Promise<pl.PDFDocumentProxy> = null;
var viewer: PDFViewer = null;
if (document.contentType == "application/pdf") {
    const url = window.location.href;
    gpdf = pl.getDocument(url).promise;
    addEventListeners();
}

class PDFViewer {

    url: String
    pdf: pl.PDFDocumentProxy | undefined
    container: HTMLDivElement;
    viewer: pv.PDFViewer | undefined;

    constructor(url: String, container: HTMLDivElement) {
        this.url = url;
        this.container = container;
    }

    async reload() {
        // this.pdf = await pl.getDocument(this.url).promise;
        this.pdf = await gpdf;

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

        this.viewer.setDocument(this.pdf);
        linkService.setViewer(this.viewer);
        linkService.setDocument(this.pdf);

        eventBus.on("pagesinit", () => {
            this.viewer.currentScaleValue = "page-width";
        });

        const rendered = new Promise((resolve, reject) => {
            eventBus.on("annotationlayerrendered", resolve);
        });
        const title = this._getPDFTitle();
        const authors = title.then(getAuthors);

        Promise.all([rendered, title, authors])
            .then((res) => {
                const [_, title, authors] = res;

                this._addLinkToText(title, googleScholarQueryURL(title), 1);
                for (const author of authors) {
                    this._addLinkToText(author, googleScholarQueryURL(author), 1);
                }
            });
    }

    async _getPDFTitle(): Promise<string> {
        const page = await this.pdf.getPage(1);
        const textContent = await page.getTextContent();
    
        var title = "";
        var maxHeight = 0;
    
        for (const elem of textContent.items) {
            const item = elem as TextItem;
            // only consider horizontal text
            if (Math.abs(item.transform[1]) > 0 || Math.abs(item.transform[2]) > 0) continue;
    
            if (item.height > maxHeight) {
                maxHeight = item.height;
                title = item.str;
            }
            else if (item.height == maxHeight) {
                title += " " + item.str;
            }
        }
    
        return this._normalize(title);
    }

    _setDocumentTitle(text: string) {
        // In case we're in an iframe, set the top document's title too
        top.document.title = text;

        const title = document.createElement("title");
        title.innerText = text;

        const head = document.createElement("head");
        head.appendChild(title);

        document.body.insertAdjacentElement("beforebegin", head);
    }

    async _addLinkToText(str: string, url: string, pageIdx: number) {
        const als = document.getElementsByClassName("annotationLayer");
        if (als.length < pageIdx) return;

        const annotationLayer = als[pageIdx-1] as HTMLElement;
        annotationLayer.hidden = false;

        var text = "";
        var idx: number[] = [];
        var items: TextItem[] = [];

        const page = await this.pdf.getPage(pageIdx);
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
                    a.setAttribute("title", "Search on Google Scholar");
                    a.setAttribute("id", "alexandria-url-google-scholar");
                    a.setAttribute("href", url);
                    a.setAttribute("target", "_blank");

                    const pageHeight = page.view[3] - page.view[1];
                    const top = pageHeight - (item.transform[5] + item.height);
                    const section = document.createElement("section");
                    section.style.zIndex = "0";
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
        viewer = new PDFViewer(url, container);
        viewer.reload();
    });   

    document.addEventListener("keypress", (event) => {
        if (event.key == "s") {
            const url = googleScholarQueryURL(top.document.title);
            window.open(url, "_blank");
        }
        else if (event.key == "i") {
            const cls = "inverted-color";
            if (viewer.container.classList.contains(cls)) {
                viewer.container.classList.remove(cls)
            }
            else {
                viewer.container.classList.add(cls);
            }
        }
    });
}

function prepareBody(): HTMLDivElement {
    const viewer = document.createElement("div");
    viewer.setAttribute("class", "pdfViewer");
    
    const container = document.createElement("div");
    container.setAttribute("id", "alexandria-pdf-container");
    container.appendChild(viewer);

    document.body.appendChild(container);

    return container;
}