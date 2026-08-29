import { StyleSheet } from "react-native";
import { Text } from "@/components/ui/Text";
import { rs, rvs } from "@/utils/responsive";
import { Colors } from "@/constants/colors";

const SectionTitle = ({title}:{title:string}) => {
  return (
    <Text size="small" weight="bold" style={styles.sectionTitle}>
      {title}
    </Text>
  );
};

export default SectionTitle;

const styles = StyleSheet.create({
  sectionTitle: {
    color: Colors.secondary,
    letterSpacing: 1,
    marginBottom: rvs(8),
    marginTop: rvs(8),
    marginStart: rs(4),
    textTransform:"uppercase"
  },
});
