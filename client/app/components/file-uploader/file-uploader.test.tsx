import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";

const showErrorToast = vi.fn();
const toastError = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
}));
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a) },
}));

// react-dropzone is driven by a controllable mock so we can invoke the onDrop
// callback with accepted / rejected files and assert the component's behavior.
let capturedOptions: {
  onDrop?: (accepted: File[], rejected: unknown[]) => void;
  onDropAccepted?: () => void;
} | null = null;
vi.mock("react-dropzone", () => ({
  useDropzone: (opts: Record<string, unknown>) => {
    capturedOptions = opts as never;
    return {
      getRootProps: () => ({ "data-testid": "dropzone-root" }),
      getInputProps: () => ({ "data-testid": "dropzone-input" }),
      isDragAccept: false,
      isDragReject: false,
      inputRef: { current: null },
    };
  },
}));

import {
  FileInput,
  FileUploader,
  FileUploaderContent,
  FileUploaderItem,
  useFileUpload,
} from "./file-uploader";

const makeFile = (name: string) =>
  new File(["x"], name, { type: "text/plain" });

function Harness({
  value,
  onValueChange,
  options = { maxFiles: 3, multiple: true, maxSize: 5 * 1024 * 1024 },
}: {
  value: File[] | null;
  onValueChange: (v: File[] | null) => void;
  options?: Record<string, unknown>;
}) {
  return (
    <FileUploader value={value} onValueChange={onValueChange} dropzoneOptions={options}>
      <FileInput>
        <span>drop here</span>
      </FileInput>
      <FileUploaderContent>
        {(value ?? []).map((f, i) => (
          <FileUploaderItem key={f.name} index={i}>
            {f.name}
          </FileUploaderItem>
        ))}
      </FileUploaderContent>
    </FileUploader>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOptions = null;
});

describe("FileUploader", () => {
  it("renders children inside the dropzone", () => {
    render(<Harness value={[]} onValueChange={vi.fn()} />);
    expect(screen.getByText("drop here")).toBeInTheDocument();
  });

  it("adds accepted files up to maxFiles via onDrop", () => {
    const onValueChange = vi.fn();
    render(<Harness value={[]} onValueChange={onValueChange} options={{ maxFiles: 2, multiple: true }} />);
    capturedOptions!.onDrop!([makeFile("a.txt"), makeFile("b.txt"), makeFile("c.txt")], []);
    // Only the first 2 are kept.
    expect(onValueChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: "a.txt" }),
      expect.objectContaining({ name: "b.txt" }),
    ]);
  });

  it("re-selects (replaces) when maxFiles is 1", () => {
    const onValueChange = vi.fn();
    render(
      <Harness
        value={[makeFile("old.txt")]}
        onValueChange={onValueChange}
        options={{ maxFiles: 1, multiple: false }}
      />,
    );
    capturedOptions!.onDrop!([makeFile("new.txt")], []);
    expect(onValueChange).toHaveBeenCalledWith([expect.objectContaining({ name: "new.txt" })]);
  });

  it("surfaces a file-too-large rejection through showErrorToast", () => {
    render(<Harness value={[]} onValueChange={vi.fn()} options={{ maxFiles: 1, maxSize: 1024 }} />);
    capturedOptions!.onDrop!([], [{ errors: [{ code: "file-too-large" }] }]);
    expect(showErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({ errors: expect.stringContaining("too large") }),
    );
  });

  it("surfaces an invalid-type rejection", () => {
    render(<Harness value={[]} onValueChange={vi.fn()} />);
    capturedOptions!.onDrop!([], [{ errors: [{ code: "file-invalid-type" }] }]);
    expect(showErrorToast).toHaveBeenCalledWith({ errors: "Invalid file type" });
  });

  it("surfaces a generic rejection message via both toasts", () => {
    render(<Harness value={[]} onValueChange={vi.fn()} />);
    capturedOptions!.onDrop!([], [{ errors: [{ message: "boom" }] }]);
    expect(toastError).toHaveBeenCalledWith("boom");
    expect(showErrorToast).toHaveBeenCalledWith({ errors: "boom" });
  });

  it("removes a file when the remove button is clicked", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Harness value={[makeFile("a.txt"), makeFile("b.txt")]} onValueChange={onValueChange} />);
    await user.click(screen.getByText("remove item 0"));
    expect(onValueChange).toHaveBeenCalledWith([expect.objectContaining({ name: "b.txt" })]);
  });

  it("navigates the active index with arrow keys and deletes with Backspace", async () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <Harness value={[makeFile("a.txt"), makeFile("b.txt")]} onValueChange={onValueChange} />,
    );
    const root = container.querySelector("div.grid") as HTMLElement;
    fireEvent.keyDown(root, { key: "ArrowDown" });
    fireEvent.keyDown(root, { key: "ArrowDown" });
    fireEvent.keyDown(root, { key: "ArrowUp" });
    fireEvent.keyDown(root, { key: "Backspace" });
    expect(onValueChange).toHaveBeenCalled();
  });

  it("Enter with no active item clicks the hidden input", () => {
    // The Input forwards its ref to the real DOM node, replacing our mock's
    // inputRef.current, so spy on the actual element's click.
    const { container } = render(<Harness value={[makeFile("a.txt")]} onValueChange={vi.fn()} />);
    const input = screen.getByTestId("dropzone-input") as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    const root = container.querySelector("div.grid") as HTMLElement;
    fireEvent.keyDown(root, { key: "Enter" });
    expect(clickSpy).toHaveBeenCalled();
  });

  it("Escape resets the active index", () => {
    const { container } = render(<Harness value={[makeFile("a.txt")]} onValueChange={vi.fn()} />);
    const root = container.querySelector("div.grid") as HTMLElement;
    expect(() => fireEvent.keyDown(root, { key: "Escape" })).not.toThrow();
  });

  it("throws if useFileUpload is used outside a provider", () => {
    const Bad = () => {
      useFileUpload();
      return null;
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bad />)).toThrow(/must be used within/);
    spy.mockRestore();
  });

  it("marks the list full (disabled input) when value length equals maxFiles", () => {
    render(
      <Harness
        value={[makeFile("a.txt")]}
        onValueChange={vi.fn()}
        options={{ maxFiles: 1, multiple: false }}
      />,
    );
    const input = screen.getByTestId("dropzone-input") as HTMLInputElement;
    expect(input).toBeDisabled();
  });

  it("forwards refs on the sub-components", () => {
    const Consumer = () => {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <FileUploader value={[]} onValueChange={vi.fn()} dropzoneOptions={{ maxFiles: 1 }}>
          <FileUploaderContent ref={ref}>
            <FileUploaderItem index={0}>item</FileUploaderItem>
          </FileUploaderContent>
        </FileUploader>
      );
    };
    render(<Consumer />);
    expect(screen.getByText("item")).toBeInTheDocument();
  });
});
