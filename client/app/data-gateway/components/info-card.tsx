import { Card, CardContent } from "@/components/ui-kits/card/card";
import React from "react";

interface InfoCardProps {
  title: string;
  message: string;
}

export const InfoCard: React.FC<InfoCardProps> = ({ title, message }) => {
  return (
    <Card className="w-full">
      <CardContent className="p-4">
        <h4 className="text-lg font-semibold">{title}</h4>
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
};
