import { iterateURLs, Rect } from "./utils";

it("iterates over all URLs", () => {
    let text = "Introduction to katib. https://www.kubeflow.org/docs/components/hyperparameter-tuning/overview/. Accessed: 2020-05-18.";
    let matches = Array.from(iterateURLs(text)).map(([s, e]) => text.slice(s, e));
    expect(matches).toEqual(["https://www.kubeflow.org/docs/components/hyperparameter-tuning/overview/."]);

    text = "Production-grade container orchestration - kubernetes. https://kubernetes.io/. Accessed: 2020-05-18";
    matches = Array.from(iterateURLs(text)).map(([s, e]) => text.slice(s, e));
    expect(matches).toEqual(["https://kubernetes.io/."]);
});

describe("rect", () => {
    it("overlaps", () => {
        const lhs = new Rect(100, 200, 100, 200);

        // overlapping areas
        const rhs1 = new Rect(0, 300, 0, 300);
        expect(lhs.overlapsWith(rhs1)).toBe(true);

        // contained in lhs
        const rhs2 = new Rect(140, 160, 140, 160);
        expect(lhs.overlapsWith(rhs2)).toBe(true);
    });

    it("doesn't overlap", () => {
        const lhs = new Rect(100, 200, 100, 200);
        const rhs = new Rect(500, 600, 0, 300);

        expect(lhs.overlapsWith(rhs)).toBe(false);
    });
});