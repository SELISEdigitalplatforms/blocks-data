import { tStatic } from "@seliseblocks/genesis-os/i18n";
export const dataServiceInstructions = {
  get description() { return tStatic("data.gateway.schema", "INSTRUCTIONS.CONNECT_YOUR_DATA_SOURCE_AND_LET"); },
  get note() { return tStatic("data.gateway.schema", "INSTRUCTIONS.TO_GET_STARTED"); },
  get steps() { return [tStatic("data.gateway.schema", "INSTRUCTIONS.CLICK_CONFIGURE_TO_OPEN_THE_DATA"), tStatic("data.gateway.schema", "INSTRUCTIONS.CHOOSE_BETWEEN_A_DATABASE_FROM_BLOCKS"), tStatic("data.gateway.schema", "INSTRUCTIONS.SELECT_OR_PROVIDE_CONNECTION_DETAILS"), tStatic("data.gateway.schema", "INSTRUCTIONS.REVIEW_AND_CONFIRM_THE_CONFIGURATION"), tStatic("data.gateway.schema", "INSTRUCTIONS.COME_BACK_HERE_TO_SET_UP")]; },
};
