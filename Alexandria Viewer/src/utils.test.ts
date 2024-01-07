import { iterateURLs } from "./utils";

it("iterates over all URLs", () => {
    let text = "Introduction to katib. https://www.kubeflow.org/docs/components/hyperparameter-tuning/overview/. Accessed: 2020-05-18.";
    let matches = Array.from(iterateURLs(text)).map(([s, e]) => text.slice(s, e));
    expect(matches).toEqual(["https://www.kubeflow.org/docs/components/hyperparameter-tuning/overview/."]);

    text = "Production-grade container orchestration - kubernetes. https://kubernetes.io/. Accessed: 2020-05-18";
    matches = Array.from(iterateURLs(text)).map(([s, e]) => text.slice(s, e));
    expect(matches).toEqual(["https://kubernetes.io/."]);
});