import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ customFetch: vi.fn() }));
vi.mock("@workspace/api-client-react", () => ({ customFetch: mocks.customFetch }));
import { ReceiptPreview } from "./ReceiptPreview";

describe("ReceiptPreview (compact original-receipt row)", () => {
  const createObjectURL = vi.fn(() => "blob:receipt-1");
  const revokeObjectURL = vi.fn();
  let open: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.customFetch.mockReset().mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    open = vi.spyOn(window, "open").mockImplementation(() => null);
  });
  afterEach(() => { open.mockRestore(); vi.clearAllMocks(); });

  it("shows only the row (no inline PDF/image preview) and opens the file in a new tab", async () => {
    const { container } = render(
      <ReceiptPreview fileUrl="/api/receipts/1/file" fileName="invoice xbox controller.pdf" />,
    );
    expect(screen.getByText("Original receipt")).toBeTruthy();
    expect(screen.getByText("invoice xbox controller.pdf")).toBeTruthy();
    expect(container.querySelector("iframe, img, embed, object")).toBeNull();
    expect(screen.queryByLabelText("Toggle receipt preview")).toBeNull();

    const openButton = screen.getByRole("button", { name: "Open original receipt in new tab" });
    await waitFor(() => expect((openButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(openButton);
    expect(open).toHaveBeenCalledWith("blob:receipt-1", "_blank");
    expect(container.querySelector("iframe, img, embed, object")).toBeNull();
  });

  it("keeps Open disabled when the file cannot be fetched", async () => {
    mocks.customFetch.mockReset().mockRejectedValue(new Error("nope"));
    render(<ReceiptPreview fileUrl="/api/receipts/2/file" fileName="photo.jpg" />);
    const openButton = screen.getByRole("button", { name: "Open original receipt in new tab" }) as HTMLButtonElement;
    await waitFor(() => expect(mocks.customFetch).toHaveBeenCalled());
    expect(openButton.disabled).toBe(true);
  });
});
