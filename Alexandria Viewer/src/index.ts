const pdfjs = require("pdfjs-dist");
const pdfjsWorker = require("pdfjs-dist/build/pdf.worker.entry");

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

window.onload = () => {
    if (document.contentType == "application/pdf") {
        document.body.innerHTML = body();
    }
    
    const url = window.location.href;
    pdfjs.getDocument(url).promise.then(function (pdf: any) {
        pdf.getMetadata().then(function(stuff: any) {
            console.log(stuff); // Metadata object here
        }).catch(function(err: any) {
           console.log('Error getting meta data');
           console.log(err);
        });
    });
};

function body() {
    return "<p>Aboobsato Impsum</p>";
}
