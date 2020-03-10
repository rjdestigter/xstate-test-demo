import { createMachine } from "xstate";
import { createModel } from "@xstate/test";
import { Page, Request } from "puppeteer";
import { Deferred, defer } from "./delay";

type Event =
  | {
      type: "CLICK_GOOD" | "CLICK_BAD" | "CLOSE" | "ESC" | "SUCCESS" | "FAILURE"
    }
  | { type: "SUBMIT"; value: string };

export const makeOnRequest = (
  failurePattern: string[][][],
  buffer: Deferred[] = []
) => async (interceptedRequest: Request): Promise<void> => {
  while (buffer.length > 0) {
    const deferred = buffer[0];

    if (deferred) {
      await deferred;
      buffer.shift();
    }
  }

  const url = interceptedRequest.url();

  if (/foobar/.test(url)) {
    if (interceptedRequest.method() === "OPTIONS") {
      return interceptedRequest.respond({
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    const frameUrl = interceptedRequest.frame()?.url() || "";
    const [, pathIndex, planIndex] = (frameUrl.match(/\d+/g) || []).map(Number);
    const outcome = failurePattern[planIndex][pathIndex].shift();

    if (outcome === 'FAILURE') {
      return interceptedRequest.abort();
    }
  }

  return interceptedRequest.continue();
};

describe("feedback app", () => {
  const buffer: Deferred[] = [];
  const failurePattern: string[][][] = [];

  const onRequest = makeOnRequest(failurePattern, buffer);

  beforeAll(async () => {
    await page.setRequestInterception(true);
    page.on("request", onRequest);
  });

  afterAll(async () => {
    page.off("request", onRequest);
    await page.setRequestInterception(false);
  });

  const feedbackMachine = createMachine<{}, Event>({
    id: "feedback",
    initial: "question",
    on: {
      ESC: "closed"
    },
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
            await page.waitFor('[data-testid="bad-button"]');
            await page.waitFor('[data-testid="good-button"]');

            // await page.hover('data-testid="bad-button"')
            // await delay()
          }
        }
      },
      form: {
        on: {
          SUBMIT: [
            {
              target: "submitting",
              cond: (_, e) => e.value.trim().length > 0
            },
            { target: "closed" }
          ],
          CLOSE: "closed"
        },
        meta: {
          test: async (page: Page) => {
            await page.waitFor('[data-testid="form-screen"]');
          }
        }
      },
      submitting: {
        on: {
          SUCCESS: 'thanks',
          FAILURE: 'failure'
        },
        meta: {
          test: async (page: Page) => {
            await page.waitFor('[data-testid="submitting"]');

            buffer.forEach(deferred => {
              deferred.resolve()
            })
          }
        }
      },
      failure: {
        on: {
          CLOSE: "closed"
        },
        meta: {
          test: async (page: Page) => {
            await page.waitFor('[data-testid="failure-screen"]');
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
        // type: "final",
        meta: {
          test: async (page: Page) => {
            return page.waitFor('[data-testid="close-browser-msg"]');
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
    SUCCESS: async page => {
      return true;
    },
    FAILURE: async page => {
      return true;
    },
    SUBMIT: {
      exec: async (page, event: any) => {
        await page.type('[data-testid="response-input"]', event.value);

        if (event.value.length > 0) {
          buffer.push(defer('Submitting' ,'Submitting'))
        }

        await page.click('[data-testid="submit-button"]');
      },
      cases: [{ value: "something" }, { value: "" }]
    }
  });

  const testPlans = testModel.getSimplePathPlans();

  testPlans.forEach((plan, planIndex) => {
    describe(`${planIndex}: ${plan.description}`, () => {
      failurePattern[planIndex] = [];

      plan.paths.forEach((path, pathIndex) => {
        it(
          `${pathIndex}: ${path.description}`,
          async () => {
            failurePattern[planIndex][pathIndex] =
              path.description.match(
                /SUCCESS|FAILURE/g
              ) || [];

            const outcomes = failurePattern[planIndex][pathIndex];

            await page.goto(
              `http://localhost:7777?pathIndex=${pathIndex}&planIndex=${planIndex}&outcomes=${outcomes.join(
                ","
              )}`
            );

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
