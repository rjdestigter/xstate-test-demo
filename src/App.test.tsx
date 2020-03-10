import React from "react";
import Feedback from "./App";
import { createMachine } from "xstate";
import { render, fireEvent, cleanup, waitForElement, act } from "@testing-library/react";
import { assert } from "chai";
import { createModel } from "@xstate/test";

// describe('feedback app', () => {
//   afterEach(cleanup);

//   it('should show the thanks screen when "Good" is clicked', () => {
//     const { getByTestId } = render(<Feedback />);

//     // The question screen should be visible at first
//     assert.ok(getByTestId('question-screen'));

//     // Click the "Good" button
//     fireEvent.click(getByTestId('good-button'));

//     // Now the thanks screen should be visible
//     assert.ok(getByTestId('thanks-screen'));
//   });

//   it('should show the form screen when "Bad" is clicked', () => {
//     const { getByTestId } = render(<Feedback />);

//     // The question screen should be visible at first
//     assert.ok(getByTestId('question-screen'));

//     // Click the "Bad" button
//     fireEvent.click(getByTestId('bad-button'));

//     // Now the form screen should be visible
//     assert.ok(getByTestId('form-screen'));
//   });
// });

// ............

type Event =
  | {
      type: "CLICK_GOOD" | "CLICK_BAD" | "CLOSE" | "ESC";
    }
  | { type: "SUBMIT"; value: string };


type TestContext = ReturnType<typeof render>;

describe("feedback app", () => {
  beforeEach(() => { // if you have an existing `beforeEach` just add the following line to it
    fetchMock.mockIf(/foobar/, async () => {
      return { status: 200 }
    })
  })

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
          test: ({ getByTestId }: TestContext) => {
            assert.ok(getByTestId("question-screen"));
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
          test: ({ getByTestId }: TestContext) => {
            assert.ok(getByTestId("form-screen"));
          }
        }
      },
      thanks: {
        on: {
          CLOSE: "closed"
        },
        meta: {
          test: async ({ getByTestId }: TestContext) => {
            const element = await waitForElement(() => getByTestId("thanks-screen"))
            assert.ok(element);
          }
        }
      },
      closed: {
        type: "final",
        meta: {
          test: ({ queryByTestId }: TestContext) => {
            assert.isNull(queryByTestId("thanks-screen"));
          }
        }
      }
    }
  });

  const testModel = createModel<ReturnType<typeof render>>(feedbackMachine).withEvents({
    CLICK_GOOD: async ({ getByText }) => {
      fireEvent.click(getByText("Good") as HTMLElement);
    },
    CLICK_BAD: ({ getByText }) => {
      fireEvent.click(getByText("Bad") as HTMLElement);
    },
    CLOSE: ({ getByTestId }) => {
      fireEvent.click(getByTestId("close-button") as HTMLElement);
    },
    ESC: ({ baseElement }) => {
      fireEvent.keyDown(baseElement, { key: "Escape" });
    },
    SUBMIT: {
      exec: async ({ getByTestId }, event: any) => {
        fireEvent.change(getByTestId("response-input") as HTMLElement, {
          target: { value: event.value }
        });
        
        fireEvent.click(getByTestId("submit-button") as HTMLElement);
      },
      cases: [{ value: "something" }, { value: "" }]
    }
  });

  const testPlans = testModel.getSimplePathPlans();

  testPlans.forEach(plan => {
    describe(plan.description, () => {
      afterEach(cleanup);

      plan.paths.forEach(path => {
        it(path.description, () => {
          return act(async () => {
            const rendered = render(<Feedback />);
            await path.test(rendered);
          })
        });
      });
    });
  });

  it("coverage", () => {
    testModel.testCoverage();
  });
});
