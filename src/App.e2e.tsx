import { createMachine } from "xstate";
import { createModel } from "@xstate/test";
import { Page } from 'puppeteer'

type Event =
  | {
      type: "CLICK_GOOD" | "CLICK_BAD" | "CLOSE" | "ESC";
    }
  | { type: "SUBMIT"; value: string };

describe("feedback app", () => {
  const feedbackMachine = createMachine<any, Event>({
    id: "feedback",
    initial: "question",
    states: {
      question: {
        on: {
          CLICK_GOOD: "thanks",
          CLICK_BAD: "form",
          CLOSE: "closed"
        },
        meta: {
          test: async (page: Page) => {
            await page.waitFor('[data-testid="question-screen"]');
          }
        }
      },
      form: {
        on: {
          SUBMIT: [
            {
              target: "thanks",
              cond: (_, e) => e.value.length > 0
            }
          ],
          CLOSE: "closed"
        },
        meta: {
          test: async (page: Page) => {
            await page.waitFor('[data-testid="form-screen"]');
          }
        }
      },
      thanks: {
        on: {
          CLOSE: "closed"
        },
        meta: {
          test: async (page: Page) => {
            await page.waitFor('[data-testid="thanks-screen"]');
          }
        }
      },
      closed: {
        type: "final",
        meta: {
          test: async (page: Page) => {
            return true;
          }
        }
      }
    }
  });

  const testModel = createModel<Page>(feedbackMachine).withEvents({
    CLICK_GOOD: async page => {
      await page.click('[data-testid="good-button"]');
    },
    CLICK_BAD: async page => {
      await page.click('[data-testid="bad-button"]');
    },
    CLOSE: async page => {
      await page.click('[data-testid="close-button"]');
    },
    ESC: async page => {
      await page.keyboard.press("Escape");
    },
    SUBMIT: {
      exec: async (page, event: any) => {
        await page.type('[data-testid="response-input"]', event.value);
        await page.click('[data-testid="submit-button"]');
      },
      cases: [{ value: "something" }, { value: "" }]
    }
  });

  const testPlans = testModel.getSimplePathPlans();

  testPlans.forEach((plan, i) => {
    describe(plan.description, () => {
      plan.paths.forEach((path, i) => {
        it(
          path.description,
          async () => {
            await page.goto("http://localhost:3000");
            await path.test(page);
          },
          10000
        );
      });
    });
  });

  it("coverage", () => {
    testModel.testCoverage();
  });
});
