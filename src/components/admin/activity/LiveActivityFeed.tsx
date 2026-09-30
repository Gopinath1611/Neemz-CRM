import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";

export interface LiveActivityItem {
  id: string;
  userName: string;
  actionText: string;
  module: string;
  timeAgo: string;
}

export interface LiveActivityFeedProps {
  items: LiveActivityItem[];
}

const LiveActivityFeed = ({ items }: LiveActivityFeedProps) => {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary animate-pulse" />
          Live Activity
        </CardTitle>
        <Badge variant="secondary">{items.length}</Badge>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-96 px-4 pb-4">
          <div className="flex flex-col gap-3">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No recent activity.
              </p>
            )}
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-border p-3 text-sm bg-card"
              >
                <p className="leading-snug">
                  <span className="font-medium">{item.userName}</span>{" "}
                  {item.actionText}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <Badge variant="outline" className="text-[10px]">
                    {item.module}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">{item.timeAgo}</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default LiveActivityFeed;
