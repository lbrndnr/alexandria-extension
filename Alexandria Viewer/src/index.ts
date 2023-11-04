import * as pl from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import * as pv from "pdfjs-dist/web/pdf_viewer";
import { CrossrefClient, QueryWorksParams } from "@jamesgopsill/crossref-client"

pl.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/build/pdf.worker.entry");

// const client = new CrossrefClient()
    
// const search: QueryWorksParams = {
//     queryTitle: title,
// };
// client.works(search).then(r => {
//     console.log(r);
//     for (const paper of r.content.message.items) {
//         console.log(paper.title);
//     }
// });

class PDFViewer {

    url: String
    pdf: pl.PDFDocumentProxy | undefined
    container: HTMLDivElement;

    constructor(url: String, container: HTMLDivElement) {
        this.url = url;
        this.container = container;
    }

    load() {
        pl.getDocument(this.url).promise.then((pdf: pl.PDFDocumentProxy) => {
            this.pdf = pdf;

            const eventBus = new pv.EventBus();
            const linkService = new pv.PDFLinkService({
                eventBus,
                externalLinkRel: "noopener noreferrer nofollow",
                externalLinkTarget: pv.LinkTarget.BLANK
            });	
            const viewer = new pv.PDFViewer({
                container: this.container,
                eventBus,
                linkService,
                l10n: pv.NullL10n
            });

            linkService.setViewer(viewer);

            eventBus.on("pagesinit", () => {
                viewer.currentScaleValue = "page-width";
            });

            eventBus.on('textlayerrendered', () => {
                const layer = document.getElementsByClassName("textLayer")[0];

                var text = "";
                var idx: number[] = [];

                for (const elem of layer.children) {
                    idx.push(text.length);
                    text += elem.textContent;
                }

                pdf.getPage(1).then(page => {
                    extractTitleFromPage(page).then(value => {
                        const title = value[0];

                        const k = text.indexOf(title);
                        if (k > 0) {
                            var elems = [];
                            
                            idx.forEach((i, j) => {
                                if (i > k + title.length) return;

                                if (i >= k && i < k + title.length) {

                                    const query = encodeURIComponent(title);
                                    const url = `https://scholar.google.com/scholar?q=${query}`

                                    const span = layer.children[j];
                                    const a = document.createElement("a");
                                    a.setAttribute("href", url);
                                    a.setAttribute("target", "_blank");
                                    a.innerHTML = span.outerHTML;

                                    layer.insertBefore(a, span);
                                    span.remove();
                                }
                            });
                        }

                    });
                });
            });

            viewer.setDocument(this.pdf);
            linkService.setDocument(this.pdf);
        });
    }

}

document.addEventListener("DOMContentLoaded", (_) => {
    if (document.contentType == "application/pdf") {
        const container = prepareBody();    
        const url = window.location.href;
        const viewer = new PDFViewer(url, container);
        viewer.load();
    }
    // else {
        // const declaration = document.styleSheets[0].rules[0].style;
        // const oldValue = declaration.removeProperty("background-color");
    // }
});

function prepareBody(): HTMLDivElement {
    const viewer = document.createElement("div");
    viewer.setAttribute("class", "pdfViewer");
    
    const container = document.createElement("div");
    container.setAttribute("id", "alexandria-pdf-container");
    container.appendChild(viewer);

    document.body.appendChild(container);

    return container;
}

async function extractTitleFromPage(page: pl.PDFPageProxy): Promise<[string, Array<any>]> {
    let textContent = await page.getTextContent();

    var title = "";
    var maxHeight = 0;
    var rect = [0, 0, 0, 0];

    for (const elem of textContent.items) {
        const item = elem as TextItem;

        if (item.height > maxHeight) {
            maxHeight = item.height;
            title = item.str;
            rect = [item.transform[4], item.transform[5], item.width, item.height];
        }
        else if (item.height == maxHeight) {
            title += item.str;

            const nr = [item.transform[4], item.transform[5], item.width, item.height];
            rect = [Math.min(rect[0], nr[0]), Math.min(rect[1], nr[1]), Math.max(rect[2], nr[2]), Math.max(rect[3], nr[3])];
        }
    }

    return [title, rect];
}