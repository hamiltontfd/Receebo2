import { motion } from "framer-motion";

const ease = [0.25, 0.1, 0.25, 1] as const;

export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease }}
    >
      {children}
    </motion.div>
  );
}

export const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055 } },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 7 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease },
  },
};

export const cardVariants = {
  hidden: { opacity: 0, x: 16 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.22, ease },
  },
};
