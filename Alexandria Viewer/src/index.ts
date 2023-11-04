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
    viewer: pv.PDFViewer | undefined;

    constructor(url: String, container: HTMLDivElement) {
        this.url = url;
        this.container = container;
    }


    async load() {
        this.pdf = await pl.getDocument(this.url).promise;

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

        eventBus.on('textlayerrendered', () => {
            
        });

        const title = await this._getPDFTitle();
        this._setDocumentTitle(title);
    }

    _loadNodeTree() {
        const layer = document.getElementsByClassName("textLayer")[0];

            var text = "";
            var idx: number[] = [];

            for (const elem of layer.children) {
                idx.push(text.length);
                text += elem.textContent;
            }

                // pdf.getPage(1).then(page => {
                //     extractTitleFromPage(page).then(value => {
                //         const title = value[0];

                //         const k = text.indexOf(title);
                //         if (k > 0) {
                //             var elems = [];
                            
                //             idx.forEach((i, j) => {
                //                 if (i > k + title.length) return;

                //                 if (i >= k && i < k + title.length) {

                //                     const query = encodeURIComponent(title);
                //                     const url = `https://scholar.google.com/scholar?q=${query}`

                //                     const span = layer.children[j];
                //                     const a = document.createElement("a");
                //                     a.setAttribute("href", url);
                //                     a.setAttribute("target", "_blank");
                //                     a.innerHTML = span.outerHTML;

                //                     layer.insertBefore(a, span);
                //                     span.remove();
                //                 }
                //             });
                //         }

                //     });
                // });
    }

    async _getPDFTitle(): Promise<string> {
        const page = await this.pdf.getPage(1);
        const textContent = await page.getTextContent();
    
        var title = "";
        var maxHeight = 0;
    
        for (const elem of textContent.items) {
            const item = elem as TextItem;
    
            if (item.height > maxHeight) {
                maxHeight = item.height;
                title = item.str;
            }
            else if (item.height == maxHeight) {
                title += item.str;
            }
        }
    
        return title;
    }

    _setDocumentTitle(text: string) {
        const title = document.createElement("title");
        title.innerText = text;

        const head = document.createElement("head");
        head.appendChild(title);
        
        document.body.insertAdjacentElement("beforebegin", head);
    }

    // addLink(text: string, url: string) {
        
    // }

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