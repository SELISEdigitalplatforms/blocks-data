import { Captcha } from "@/components/captcha";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui-kits/button/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui-kits/form/form";
import { Input } from "@/components/ui-kits/input/input";
import { useTheme } from "@/hooks/use-theme";
import { showErrorToast } from "@/hooks/use-toast";
import { isErrorWithErrors } from "@/lib/error";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { useAuthStore } from "@/store/use-auth-store";
import { useSigninByEmail } from "@blocks-idp/authentication/hooks/use-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { signinFormDefaultValue, signinFormSchema } from "./schema";
import { useT } from "@seliseblocks/genesis-os/i18n";

export const SigninForm = () => {
  const { t } = useT("data.idp.authentication");
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { setAuthenticated, setTokens } = useAuthStore();
  const [token, setToken] = useState("");
  const form = useForm({
    defaultValues: signinFormDefaultValue,
    resolver: zodResolver(signinFormSchema),
  });
  const { isPending, mutateAsync } = useSigninByEmail();
  const onSubmitHandler = async (values: z.infer<typeof signinFormSchema>) => {
    try {
      const res = await mutateAsync(values);
      if (res.enable_mfa)
        return navigate(
          `/mfa-check?mfa_id=${res.mfaId}&mfa_type=${res.mfaType}`,
        );

      // For localhost, save tokens in store for Authorization Bearer
      const isLocalhost = getRuntimeEnv("BLOCKS_DATA_BASE_URL")?.includes(
        "localhost",
      );
      if (isLocalhost && res.access_token && res.refresh_token) {
        setTokens(res.access_token, res.refresh_token);
      }

      setAuthenticated();
      navigate("/console");
    } catch (error: unknown) {
      if (isErrorWithErrors(error)) {
        showErrorToast({
          errors: error.errors.error_description || t("SIGNIN_FORM.SOMETHING_WENT_WRONG"),
        });
      } else {
        showErrorToast({ errors: t("SIGNIN_FORM.SOMETHING_WENT_WRONG") });
      }
    }
  };
  const {
    formState: { submitCount },
  } = form;
  const googleSiteKey = getRuntimeEnv("BLOCKS_GOOGLE_SITE_KEY") || "";
  const isTokenNeed = submitCount >= 3;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmitHandler)}
        className="flex flex-col gap-4"
      >
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("common:EMAIL")}</FormLabel>
              <FormControl>
                <Input placeholder={t("SIGNIN_FORM.ENTER_YOUR_EMAIL")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("SIGNIN_FORM.PASSWORD")}</FormLabel>
              <FormControl>
                <PasswordInput placeholder={t("SIGNIN_FORM.ENTER_YOUR_PASSWORD")} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Link
          to="/forgot-password"
          className="ml-auto inline-block text-sm text-primary"
        >
          {t("SIGNIN_FORM.FORGOT_PASSWORD")}
        </Link>
        {isTokenNeed && (
          <Captcha
            type="reCaptcha-v2-checkbox"
            siteKey={googleSiteKey}
            theme={theme === "dark" ? "dark" : "light"}
            onVerify={(token) => setToken(token)}
            onExpired={() => setToken("")}
            onError={() => setToken("")}
          />
        )}

        <Button
          type="submit"
          className="w-full rounded"
          disabled={isPending || (isTokenNeed && !token)}
        >
          {t("SIGNIN_FORM.LOG_IN")}
        </Button>
      </form>
    </Form>
  );
};
