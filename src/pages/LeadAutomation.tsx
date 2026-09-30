import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, MessageSquare, Workflow, Phone, PhoneCall, Zap, ArrowRight } from "lucide-react";

const automationModules = [
  {
    id: "email",
    title: "Email Campaigns",
    description: "Create email templates, run campaigns & track open/click rates",
    icon: Mail,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    path: "/automation-email",
  },
  {
    id: "whatsapp",
    title: "WhatsApp API",
    description: "Connect Meta API, create templates, run bulk campaigns & setup bots",
    icon: MessageSquare,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    path: "/automation-whatsapp",
  },
  {
    id: "workflow",
    title: "Workflow Builder",
    description: "Build lead flows with triggers from Meta, Google, Website & more",
    icon: Workflow,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    path: "/automation-workflow",
  },
  {
    id: "sms",
    title: "SMS Campaigns",
    description: "Send bulk & transactional SMS to your contacts",
    icon: Phone,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    path: "/automation-sms",
  },
  {
    id: "ivr",
    title: "IVR Management",
    description: "Call logs, telecaller stats, IVR menu config & credit recharge",
    icon: PhoneCall,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    path: "/automation-ivr",
  },
];

const LeadAutomation = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-display flex items-center gap-2">
          <Zap className="text-primary" size={24} />
          Lead Automation
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Select a channel to manage campaigns, templates & automations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {automationModules.map((mod) => (
          <Card
            key={mod.id}
            className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
            onClick={() => navigate(mod.path)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${mod.bgColor}`}>
                  <mod.icon className={mod.color} size={22} />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{mod.title}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">{mod.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Button variant="ghost" size="sm" className="w-full justify-between text-xs group-hover:text-primary">
                Open {mod.title}
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default LeadAutomation;
