/// <reference types="cypress" />

import { createMachine } from "xstate";
import { createModel } from "@xstate/test";
// import '@rckeller/cypress-unfetch'
import "@rckeller/cypress-unfetch/await";
import { Deferred, defer } from "../../../src/delay";

import unfetch from "../../unfetch";

/**
 * Events dispatched to and by the testing machine
 */
type FeedbackEvent =
  | {
      type:
        | "CLICK_GOOD"
        | "CLICK_BAD"
        | "CLOSE"
        | "ESC"
        | "SUCCESS"
        | "FAILURE";
    }
  | { type: "SUBMIT"; value: string };



context("Feedback E2E Test", () => {
  const buffer: Deferred[] = [];
  const failurePattern: string[][][] = [];
  
  before(() => {
    cy.log("Cypress-Unfetch: Polyfill Fetch >>> XHR Fallback");
    // Load the standalone polyfill w/ a closure, prevents race
    Cypress.on("window:before:load", win => {
      Object.assign(win, { fetch: unfetch(buffer) });
    });
  });

  beforeEach(() => {
    cy.route({
      method: "GET",
      url: /SUCCESS.*foobar/,
      response: [],
      delay: 250,
    }).as("SUCCESS");

    cy.route({
      method: "GET",
      url: /FAILURE.*foobar/,
      status: 500,
      delay: 250,
    }).as("FAILURE");
  });

  // https://on.cypress.io/interacting-with-elements

  const feedbackMachine = createMachine<{}, FeedbackEvent>({
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
          test: async (cp: typeof cy) => {
            return new Cypress.Promise(async resolve => {
              cp.get('[data-testid="question-screen"]').then(() =>
                cp.get('[data-testid="bad-button"]').then(() =>
                  cp.get('[data-testid="good-button"]').then(() => {
                    resolve();
                  })
                )
              );
            });
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
          test: () => {
            return new Cypress.Promise(async resolve => {
              cy.get('[data-testid="form-screen"]').then(resolve);
            });
          }
        }
      },
      submitting: {
        on: {
          SUCCESS: "thanks",
          FAILURE: "failure"
        },
        meta: {
          test: (cp: typeof cy) => {
            return new Cypress.Promise(async resolve => {
              cp.get('[data-testid="submitting"]').then(() => {
                // And resolve the promise in the buffer so that the
                // request interceptor can continue
                buffer.forEach(deferred => {
                  deferred.resolve();
                });

                resolve()
              });
            });
          }
        }
      },
      failure: {
        on: {
          CLOSE: "closed"
        },
        meta: {
          test: (cp: typeof cy) => {
            return new Cypress.Promise(async resolve => {
              cp.get('[data-testid="failure-screen"]').then(resolve);
            });
          }
        }
      },
      thanks: {
        on: {
          CLOSE: "closed"
        },
        meta: {
          test: (cp: typeof cy) => {
            return new Cypress.Promise(async resolve => {
              cp.get('[data-testid="thanks-screen"]').then(resolve);
            });
          }
        }
      },
      closed: {
        // type: "final",
        meta: {
          test: (cp: typeof cy) => {
            return new Cypress.Promise(async resolve => {
              cp.get('[data-testid="close-browser-msg"]').then(resolve);
            });
          }
        }
      }
    }
  });

  const testModel = createModel<typeof cy>(feedbackMachine).withEvents({
    CLICK_GOOD: cp => {
      return new Cypress.Promise(async resolve => {
        cp.get('[data-testid="good-button"]')
          .click()
          .then(resolve);
      });
    },
    CLICK_BAD: cp => {
      return new Cypress.Promise(async resolve => {
        cp.get('[data-testid="bad-button"]')
          .click()
          .then(resolve);
      });
    },
    CLOSE: cp => {
      return new Cypress.Promise(async resolve => {
        cp.get('[data-testid="close-button"]')
          .click()
          .then(resolve);
      });
    },
    ESC: cp => {
      return new Cypress.Promise(async resolve => {
        cp.get("body")
          .type("{esc}")
          .then(resolve);
      });
    },
    SUCCESS: cp => {
      return;
    },
    FAILURE: cp => {
      return;
    },
    SUBMIT: {
      exec: (cp: typeof cy, event: any) => {
        return new Cypress.Promise(async resolve => {
          const handle = cp.get('[data-testid="response-input"]')
          const nextHandle = event.value ? handle.type(event.value) : handle;

          nextHandle.then(() => {
            if (event.value.length > 0) {
                // Put a promise in the buffer to be resolved
                // in the "submitting" state's test.
                cy.log(`Buffer Submitting`);
                buffer.push(defer("Submitting", "Submitting"));
              }

              cp.get('[data-testid="submit-button"]')
                .click()
                .then(resolve);
            });
        });
      },
      cases: [{ value: "something" }, { value: "" }]
    }
  });

  // Create the test plans
  const testPlans = testModel.getSimplePathPlans();

  // Iterate the plans and paths and test each:
  testPlans.slice(0, 2).forEach((plan, planIndex) => {
    describe(`${planIndex}: ${plan.description}`, () => {
      // Start with an empty list for the failur patterns for this plan.
      failurePattern[planIndex] = [];

      plan.paths.forEach((path, pathIndex) => {
        it(`${pathIndex}: ${path.description}`, () => {
          // Populate this path's failure pattern
          failurePattern[planIndex][pathIndex] =
            path.description.match(/SUCCESS|FAILURE/g) || [];

          const outcomes = failurePattern[planIndex][pathIndex];

          // Outcomes is added to the frame url for info but pathIndex and planIndex are important
          // as they are read in the request interceptor
          cy.visit(
            `http://localhost:7777?pathIndex=${pathIndex}&planIndex=${planIndex}&outcomes=${outcomes.join(
              ","
            )}`
          );

          return new Cypress.Promise(async resolve => {
            await path.test(cy);
            resolve();
          });
        });
        // 10000
      });
    });
  });

  it.skip("coverage", () => {
    testModel.testCoverage();
  });
});
