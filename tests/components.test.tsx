import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Symbol } from "@/components/brand/Symbol";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";

describe("Button", () => {
  it("renders a button with type=button by default", () => {
    render(<Button>Enter</Button>);
    expect(screen.getByRole("button", { name: "Enter" })).toHaveAttribute("type", "button");
  });
  it("renders a link when href is given", () => {
    render(<Button href="/#tiers">Membership</Button>);
    expect(screen.getByRole("link", { name: "Membership" })).toHaveAttribute("href", "/#tiers");
  });
  it("is disabled and busy while loading", () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Brand", () => {
  it("wordmark exposes a single accessible name", () => {
    render(<Wordmark />);
    expect(screen.getByRole("img", { name: "Moonuke" })).toBeInTheDocument();
  });
  it("symbol is decorative unless titled", () => {
    const { container, rerender } = render(<Symbol />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    rerender(<Symbol title="Moonuke" />);
    expect(screen.getByRole("img", { name: "Moonuke" })).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("associates label, and announces errors", () => {
    render(<Field label="Email" error="Invalid" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  });
});

describe("Segmented", () => {
  function Harness() {
    const [v, setV] = useState<"a" | "b">("a");
    return <Segmented label="Pick" value={v} onChange={setV} options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]} />;
  }
  it("is a labelled radiogroup that changes selection", () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "Pick" })).toBeInTheDocument();
    const beta = screen.getByRole("radio", { name: "Beta" });
    expect(beta).not.toBeChecked();
    fireEvent.click(beta);
    expect(beta).toBeChecked();
  });
});
