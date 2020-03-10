import { createMachine } from "xstate";
import { createModel } from "@xstate/test";
import { Page, Request } from "puppeteer";
import { Deferred, defer } from "./delay";

/**
 * Events dispatched to and by the testing machine
 */
type Event =
  | {
      type: "CLICK_GOOD" | "CLICK_BAD" | "CLOSE" | "ESC" | "SUCCESS" | "FAILURE"
    }
  | { type: "SUBMIT"; value: string };

/**
 * # Make a request interceptor for puppeteer.
 * 
 * ## Failure pattern
 * 
 * `failurePattern` is an array where each index represents a test plan's index.
 * Each element in the array is an array as well where each subindex
 * represents a  plan's path's index.
 * 
 * That array contains a list of strings representing whether the intercepted
 * request should fail or not.
 * 
 * Example:
 * ```
 * const failurePattern = [
 *  [["BAD", "OK"]],
 *  [["OK", "BAD", "OK"]],
 * ]
 * ```
 * 
 * `failurePattern` is built up in the `forEach` loops where we test each path.
 * The pattern is taken from a plan's path's description based on the events dispatched
 * for that path. This is done by applying a regular expression tothe path description.
 * 
 * So "via CLICK_BAD → SUBMIT ({"value":"something"}) → SUCCESS → CLOSE (323ms)" would
 * give you ["SUCCESS"] for example.
 * 
 * Or, if the user was able to retry a failed request:
 * 
 * "via CLICK_BAD → SUBMIT ({"value":"something"}) → FAILURE → RETRY -> SUCCESS -> CLOSE (323ms)" would
 * give you ["FAILURE", "SUCCESS"] for example.
 * 
 * The plan and path index are communicated to the request interceptor via query parameters in the frame's URL.
 * E.g., the test visits "http://localhost:3000?plathIndex=2&planInde=0"
 * 
 * ## Buffer
 * 
 * A buffer of promises is used to give you control of order-of-execution.
 * 
 * For example:
 * - in the SUBMIT event handler for this test
 * - before simulating the button click
 * - a promise is pushed to the buffer.
 * - Then in the "submitting" state's test function,
 * - once it has verified that the UI reflects a "is submitting" state
 * - it resolves the promise that is in the buffer.
 * 
 * Order of execution:
 * - Put promise in buffer
 * - Simulate click
 * - UI makes network request
 * - Interceptor picks promise from buffer and pauses.
 * - State is tested
 * - Promise in buffer is resolved
 * - Interceptor contiinues and pop's the resolved promise from the buffer.
 * @param failurePattern Pattern of failure
 * @param buffer Buffer of promises.
 */
export const makeOnRequest = (
  failurePattern: string[][][],
  buffer: Deferred[] = []
) => async (interceptedRequest: Request): Promise<void> => {
  while (buffer.length > 0) {
    const deferred = buffer[0];

    if (deferred) {
      await deferred;
      // Pop it once it's resolved. Don't pop it before that otherwise
      // the test won't have access to it to resolve it.
      buffer.shift();
    }
  }

  const url = interceptedRequest.url();

  // If the url matches an API our app would ue
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
          }
        }
      },
      form: {
        on: {
          SUBMIT: [
            {
              target: "submitting",
              // Only transition to submitting if the user has entered a value.
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
            // Wait for the loading message
            await page.waitFor('[data-testid="submitting"]');

            // And resolve the promise in the buffer so that the
            // request interceptor can continue 
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
          // Put a promise in the buffer to be resolved
          // in the "submitting" state's test.
          buffer.push(defer('Submitting' ,'Submitting'))
        }

        await page.click('[data-testid="submit-button"]');
      },
      cases: [{ value: "something" }, { value: "" }]
    }
  });

  // Create the test plans
  const testPlans = testModel.getSimplePathPlans();

  // Iterate the plans and paths and test each:
  testPlans.forEach((plan, planIndex) => {
    describe(`${planIndex}: ${plan.description}`, () => {
      // Start with an empty list for the failur patterns for this plan.
      failurePattern[planIndex] = [];

      plan.paths.forEach((path, pathIndex) => {
        it(
          `${pathIndex}: ${path.description}`,
          async () => {
            // Populate this path's failure pattern 
            failurePattern[planIndex][pathIndex] =
              path.description.match(
                /SUCCESS|FAILURE/g
              ) || [];

            const outcomes = failurePattern[planIndex][pathIndex];

            // Outcomes is added to the frame url for info but pathIndex and planIndex are important
            // as they are read in the request interceptor
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
