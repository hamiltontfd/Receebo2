import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OwnerAccessNotice } from "./OwnerAccessNotice";

describe("Owner access billing disclosure", () => {
  it("shows permanent complimentary access without a trial date", () => {
    render(<OwnerAccessNotice hasBillingAccount={false} />);
    expect(screen.getByText(/Complimentary full access/)).toBeInTheDocument();
    expect(screen.queryByText(/charges continue/)).not.toBeInTheDocument();
  });

  it("warns existing billing customers that Stripe was not canceled", () => {
    render(<OwnerAccessNotice hasBillingAccount />);
    expect(screen.getByText(/charges continue until you cancel/)).toBeInTheDocument();
  });
});
