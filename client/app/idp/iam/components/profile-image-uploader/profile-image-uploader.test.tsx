import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const presignedMutate = vi.fn();
const uploadImageMutate = vi.fn();
const updateUserMutate = vi.fn();
const getFileByFileId = vi.fn();
const showErrorToast = vi.fn();
const showSuccessToast = vi.fn();
let userData: unknown;
let isErr = false;

vi.mock("@/hooks/use-toast", () => ({
  showErrorToast: (...a: unknown[]) => showErrorToast(...a),
  showSuccessToast: (...a: unknown[]) => showSuccessToast(...a),
}));
vi.mock("@/lib/error", () => ({ isErrorWithErrors: () => isErr }));
vi.mock("@/storage/hooks/use-storage-file", () => ({
  useGetPreSignedUrlForUpload: () => ({ mutateAsync: presignedMutate }),
  useUploadFile: () => ({ mutateAsync: uploadImageMutate }),
}));
vi.mock("@blocks-idp/iam/hooks/use-user", () => ({
  useGetUserById: () => ({ data: userData }),
  useUpdateUser: () => ({ mutateAsync: updateUserMutate }),
}));
vi.mock("@/storage/services/storage.service", () => ({
  storageService: { file: { getFileByFileId: (...a: unknown[]) => getFileByFileId(...a) } },
}));

import { ProfileImageUploader } from "./profile-image-uploader";

const imageFile = (type = "image/png", size = 1000) => {
  const f = new File(["x"], "pic.png", { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

function selectFile(file: File) {
  const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  isErr = false;
  userData = { data: { profileImageUrl: "https://img/current.png" } };
  (globalThis as unknown as { URL: { createObjectURL: unknown } }).URL.createObjectURL = vi.fn(
    () => "blob:preview",
  );
  presignedMutate.mockResolvedValue({
    isSuccess: true,
    fileId: "f-1",
    uploadUrl: "https://upload",
  });
  uploadImageMutate.mockResolvedValue({});
  getFileByFileId.mockResolvedValue({ itemId: "img-1", url: "https://img/new.png" });
  updateUserMutate.mockResolvedValue({ isSuccess: true });
});

describe("ProfileImageUploader", () => {
  it("shows the current profile image from user data", () => {
    render(<ProfileImageUploader projectKey="tenant-1" id="user-1" />);
    expect(screen.getByAltText("Profile Image")).toHaveAttribute(
      "src",
      "https://img/current.png",
    );
  });

  it("rejects a non-image file type", () => {
    userData = { data: { profileImageUrl: "" } };
    render(<ProfileImageUploader projectKey="tenant-1" id="user-1" />);
    selectFile(imageFile("application/pdf"));
    expect(showErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({ errors: expect.stringContaining("image files") }),
    );
    expect(presignedMutate).not.toHaveBeenCalled();
  });

  it("rejects a file larger than 5MB", () => {
    render(<ProfileImageUploader projectKey="tenant-1" id="user-1" />);
    selectFile(imageFile("image/png", 6 * 1024 * 1024));
    expect(showErrorToast).toHaveBeenCalledWith({ errors: "File size must be less than 5MB" });
  });

  it("uploads a valid image end to end and shows success", async () => {
    render(<ProfileImageUploader projectKey="tenant-1" id="user-1" />);
    selectFile(imageFile());
    await waitFor(() => expect(updateUserMutate).toHaveBeenCalled());
    expect(presignedMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "pic.png", projectKey: "tenant-1" }),
    );
    expect(getFileByFileId).toHaveBeenCalledWith({ itemId: "f-1", projectKey: "tenant-1" });
    expect(showSuccessToast).toHaveBeenCalled();
  });

  it("stops early when the presigned request is not successful", async () => {
    presignedMutate.mockResolvedValue({ isSuccess: false });
    render(<ProfileImageUploader projectKey="tenant-1" id="user-1" />);
    selectFile(imageFile());
    await waitFor(() => expect(presignedMutate).toHaveBeenCalled());
    expect(uploadImageMutate).not.toHaveBeenCalled();
  });

  it("shows an error toast when the user update fails", async () => {
    updateUserMutate.mockResolvedValue({ isSuccess: false, errors: "denied" });
    render(<ProfileImageUploader projectKey="tenant-1" id="user-1" />);
    selectFile(imageFile());
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "denied" }));
  });

  it("handles a thrown error with an errors payload", async () => {
    isErr = true;
    presignedMutate.mockRejectedValue({ errors: "kaboom" });
    render(<ProfileImageUploader projectKey="tenant-1" id="user-1" />);
    selectFile(imageFile());
    await waitFor(() => expect(showErrorToast).toHaveBeenCalledWith({ errors: "kaboom" }));
  });

  it("handles a thrown error without an errors payload", async () => {
    isErr = false;
    presignedMutate.mockRejectedValue(new Error("x"));
    render(<ProfileImageUploader projectKey="tenant-1" id="user-1" />);
    selectFile(imageFile());
    await waitFor(() =>
      expect(showErrorToast).toHaveBeenCalledWith({ errors: "Something wen wrong" }),
    );
  });

  it("opens the file dialog when the Change Image button is clicked", () => {
    render(<ProfileImageUploader projectKey="tenant-1" id="user-1" />);
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: /Change Image/ }));
    expect(clickSpy).toHaveBeenCalled();
  });
});
