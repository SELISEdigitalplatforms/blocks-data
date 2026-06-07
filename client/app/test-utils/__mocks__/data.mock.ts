/**
 * Shared identifiers and generic API responses for tests.
 * Re-exports project-scoped constants from the identifier module where they already exist.
 */
export {
  TEST_PROJECT_KEY,
  TEST_TENANT_ID,
  mockSuccessResponse,
  mockErrorResponse,
  mockDeleteSuccessResponse,
} from "../../identifier/test-utils/__mocks__/data.mock";

/** Used by storage mocks when an API returns a new item id */
export const MOCK_NEW_ITEM_ID = "mock-new-item-id-001";

export const mockSuccessResponseWithItemId = {
  errors: null,
  isSuccess: true,
  itemId: MOCK_NEW_ITEM_ID,
};
