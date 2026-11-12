import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Symbol } from "@/components/brand/Symbol";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import {
  LuxuryAvatar,
  LuxuryCard,
  LuxuryDropdown,
  LuxuryEmptyState,
  LuxuryStatCard,
  LuxuryTabs,
  LuxuryTierCard,
  LuxuryToast,
  LuxuryTooltip,
} from "@/components/ui/luxury";

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
    expect(screen.getByRole("img", { name: "DivaFans" })).toBeInTheDocument();
  });
  it("symbol is decorative unless titled", () => {
    const { container, rerender } = render(<Symbol />);
    expect(container.querySelector("img")).toHaveAttribute("aria-hidden", "true");
    rerender(<Symbol title="DivaFans" />);
    expect(screen.getByRole("img", { name: "DivaFans" })).toBeInTheDocument();
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

describe("Luxury component library", () => {
  it("LuxuryTabs supports keyboard arrow navigation and selection", () => {
    function TabsHarness() {
      const [tab, setTab] = useState<"all" | "vip">("all");
      return (
        <LuxuryTabs
          label="Filter content"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "all", label: "All", count: 12 },
            { value: "vip", label: "VIP", count: 4 },
          ]}
        />
      );
    }
    render(<TabsHarness />);
    const allTab = screen.getByRole("tab", { name: /All/ });
    expect(allTab).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(allTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /VIP/ })).toHaveAttribute("aria-selected", "true");
  });

  it("LuxuryToast, LuxuryTooltip and LuxuryDropdown are keyboard operable", () => {
    const onDismiss = vi.fn();
    const onSelect = vi.fn();
    render(
      <div>
        <LuxuryToast tone="gold" title="Saved" onDismiss={onDismiss}>
          Profile updated.
        </LuxuryToast>
        <LuxuryTooltip content="Private link">
          <button type="button">Copy</button>
        </LuxuryTooltip>
        <LuxuryDropdown label="Actions" items={[{ label: "Edit tier", onSelect }]} />
      </div>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Profile updated.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledOnce();

    fireEvent.focus(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Private link");

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit tier" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("LuxuryCard, LuxuryEmptyState, LuxuryAvatar, LuxuryStatCard and LuxuryTierCard render cleanly", () => {
    render(
      <LuxuryCard smoke="ambient" accent="gold">
        <LuxuryAvatar name="Isadora" ring="gold" />
        <LuxuryStatCard label="Active members" value={42} sub="VIP included" />
        <LuxuryTierCard name="VIP" kind="vip" priceLabel="$25" benefits={["Exclusive posts"]} />
        <LuxuryEmptyState title="No items yet" description="Items appear here." />
      </LuxuryCard>,
    );
    expect(screen.getByRole("img", { name: "Isadora" })).toBeInTheDocument();
    expect(screen.getByText("Active members")).toBeInTheDocument();
    expect(screen.getByText("Exclusive posts")).toBeInTheDocument();
    expect(screen.getByText("No items yet")).toBeInTheDocument();
  });
});
