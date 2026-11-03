import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui-kits/card/card";
import { useT } from "@seliseblocks/genesis-os/i18n";

export default function RateLimiterPage() {
  const { t } = useT("data.console");
	return (
		<main className="flex flex-col gap-6 p-6">
			<div>
				<h1 className="text-xl font-semibold md:text-2xl">{t("RATE_LIMITER.RATE_LIMITER")}</h1>
				<p className="text-muted-foreground">{t("RATE_LIMITER.CONFIGURE_RATE_LIMITING_POLICIES_FOR")}</p>
			</div>

			<Card>
				<CardHeader>
					{/* <CardTitle>Rate Limiter</CardTitle>
					<CardDescription>Set up rate limiting rules and thresholds</CardDescription> */}
				</CardHeader>
				<CardContent className="flex h-40 items-center justify-center text-muted-foreground">
					{t("RATE_LIMITER.RATE_LIMITER_CONTENT_COMING_SOON")}
				</CardContent>
			</Card>
		</main>
	);
}
