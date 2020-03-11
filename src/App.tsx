import React, { useReducer, useEffect, Reducer } from "react";
import styled from "styled-components";

/**
 * React hook for execting a callback handler when the user presses a specific key.
 * @param key 
 * @param onKeyDown 
 */
function useKeyDown(key: KeyboardEvent["key"], onKeyDown: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === key) {
        onKeyDown();
      }
    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);
  }, [key, onKeyDown]);
}

const StyledScreen = styled.div`
  padding: 1rem;
  padding-top: 2rem;
  background: white;
  box-shadow: 0 1rem 2rem rgba(0, 0, 0, 0.1);
  border-radius: 0.5rem;

  > header {
    margin-bottom: 1rem;
  }

  button {
    background: #4088da;
    appearance: none;
    border: none;
    text-transform: uppercase;
    color: white;
    letter-spacing: 0.5px;
    font-weight: bold;
    padding: 0.5rem 1rem;
    border-radius: 20rem;
    align-self: flex-end;
    cursor: pointer;
    font-size: 0.75rem;

    + button {
      margin-left: 0.5rem;
    }

    &:hover: {
      opacity: 0.5;
    }

    &[data-variant="good"] {
      background-color: #7cbd67;

      &:hover {
        background-color: #7cbd67cc;
      }
    }

    &[data-variant="bad"] {
      background-color: #ff4652;

      &:hover {
        background-color: #ff4652cc;
      }
    }
  }

  textarea {
    display: block;
    margin-bottom: 1rem;
    border: 1px solid #dedede;
    font-size: 1rem;
  }

  [data-testid="close-button"] {
    position: absolute;
    top: 0;
    right: 0;
    appearance: none;
    height: 2rem;
    width: 2rem;
    line-height: 0;
    border: none;
    background: transparent;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;

    &:before {
      content: "×";
      font-size: 1.5rem;
      color: rgba(0, 0, 0, 0.5);
    }
  }
`;

type QuestionScreenProps = {
  onClickGood: () => void;
  onClickBad: () => void;
  onClose: () => void;
};

function QuestionScreen({
  onClickGood,
  onClickBad,
  onClose,
}: QuestionScreenProps) {
  return (
    <StyledScreen data-testid="question-screen">
      <header>How was your experience?</header>
      <button
        onClick={onClickGood}
        data-testid="good-button"
        data-variant="good"
      >
        Good
      </button>
      <button onClick={onClickBad} data-testid="bad-button" data-variant="bad">
        Bad
      </button>
      <button data-testid="close-button" title="close" onClick={onClose} />
    </StyledScreen>
  );
}

type FormScreenProps = {
  onSubmit: (response: { value: string }) => void;
  onSuccess: () => void;
  onFailure: () => void;
  onClose: () => void;
};

function FormScreen({ onSubmit, onClose, onSuccess, onFailure }: FormScreenProps) {
  return (
    <StyledScreen
      as="form"
      data-testid="form-screen"
      onSubmit={async (
        e: any
      ) => {
        e.preventDefault();
        const { response } = e.target.elements;
        debugger
        onSubmit(response);
        debugger
        if (response.value.length > 0) {
          try {
            await fetch(window.location.href + "&foobar=zoo")

            // throw Error("Network down")
            onSuccess()
          } catch (error) {
            onFailure()
          }
        }
      }}
    >
      <header>Care to tell us why?</header>
      <textarea
        data-testid="response-input"
        name="response"
        placeholder="Complain here"
        onKeyDown={e => {
          if (e.key === "Escape") {
            e.stopPropagation();
          }
        }}
      />
      <button data-testid="submit-button">Submit</button>
      <button
        data-testid="close-button"
        title="close"
        type="button"
        onClick={onClose}
      />
    </StyledScreen>
  );
}

type ThanksScreenProps = {
  onClose: () => void
}

function ThanksScreen({ onClose }: ThanksScreenProps) {
  return (
    <StyledScreen data-testid="thanks-screen">
      <header>Thanks for your feedback.</header>
      <button data-testid="close-button" title="close" onClick={onClose} />
    </StyledScreen>
  )
}

type FailureScreenProps = {
  onClose: () => void
}

function FailureScreen({ onClose }: FailureScreenProps) {
  return (
    <StyledScreen data-testid="failure-screen">
      <header>Something went terribly wrong :(</header>
      <button data-testid="close-button" title="close" onClick={onClose} />
    </StyledScreen>
  )
}

type Event = {
  type: "GOOD" | "BAD" | "CLOSE" | "SUCCESS" | "FAILURE"
} | {
  type: "SUBMIT",
  value: string
}

type State = "question" | "form" | "submitting" | "thanks" | "closed" | "failure"

const feedbackReducer: Reducer<State, Event> = (state: State = "question", event: Event) => {
  switch (state) {
    case "question":
      switch (event.type) {
        case "GOOD":
          return "thanks";
        case "BAD":
          return "form";
        case "CLOSE":
          return "closed";
        default:
          return state;
      }
    case "form":
      switch (event.type) {
        case "SUBMIT":
          return event.value.length > 0 ? "submitting" : "closed";
        case "CLOSE":
          return "closed";
        default:
          return state;
      }
    case "submitting": {
      switch (event.type) {
        case "SUCCESS":
          return "thanks"
        case "FAILURE":
          return "failure"
        case "CLOSE":
          return "closed";
        default:
          return state;
      }
    }
    case "failure":      
    case "thanks":
      switch (event.type) {
        case "CLOSE":
          return "closed";
        default:
          return state;
      }
    default:
      return state;
  }
}

function Feedback() {
  const [state, send] = useReducer(feedbackReducer, "question");
  useKeyDown("Escape", () => send({ type: "CLOSE" }));

  switch (state) {
    case "question":
      return (
        <QuestionScreen
          onClickGood={() => send({ type: "GOOD" })}
          onClickBad={() => send({ type: "BAD" })}
          onClose={() => send({ type: "CLOSE" })}
        />
      );
    case "form":
      return (
        <FormScreen
          onSubmit={({value}) => {
            send({ type: "SUBMIT", value })
          }}
          onSuccess={() => send({ type: "SUCCESS" })}
          onFailure={() => send({ type: "FAILURE" })}
          onClose={() => send({ type: "CLOSE" })}
        />
      );
    case "thanks":
      return <ThanksScreen onClose={() => send({ type: "CLOSE" })} />;
    case "submitting":
      return <div data-testid="submitting">...submitting your response.</div>;
    case "failure":
      return <FailureScreen onClose={() => send({ type: "CLOSE" })} />
    case "closed":
    default:
      return <div data-testid="close-browser-msg">You may now close the browser.</div>;
  }
}

const StyledApp = styled.main`
  height: 100vh;
  width: 100vw;
  background: #f5f8f9;
  display: flex;
  justify-content: center;
  align-items: center;

  &,
  * {
    position: relative;
    box-sizing: border-box;
  }
`;

function App() {
  return (
    <StyledApp>
      <Feedback />
    </StyledApp>
  );
}

export default App;
