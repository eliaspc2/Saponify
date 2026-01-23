import { Ingredient } from '../../shared/types/Ingredient';

export const parseIngredientCSV = (csvText: string): Ingredient[] => {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    return lines.slice(1).map((line) => {
        const values: string[] = [];
        let currentValue = '';
        let insideQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                insideQuotes = !insideQuotes;
            } else if (char === ',' && !insideQuotes) {
                values.push(currentValue);
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        values.push(currentValue);

        const cleanValues = values.map(v => v.trim().replace(/^"|"$/g, ''));
        const getNum = (idx: number) => {
            const val = cleanValues[idx];
            return val ? parseFloat(val.replace(',', '.')) : 0;
        };
        const getString = (idx: number) => cleanValues[idx] || '';
        const getBool = (idx: number) => getString(idx).toLowerCase() === 'true';

        const categoryStr = getString(8);

        return {
            id: getString(0),
            menuKey: getString(2),
            name: getString(3),
            inci: getString(4),
            category: categoryStr,
            descriptionFragment: getString(5),
            notes: getString(6),
            origin: getString(9),
            sapNaOH: getNum(10),
            sapKOH: getNum(11),
            iodine: getNum(12),
            ins: getNum(13),
            waterPercent: getNum(15),
            flags: {
                citricAcid: getBool(14)
            },
            properties: {
                conditioning: getNum(20),
                cleansing: getNum(21),
                bubbly: getNum(22),
                stable: getNum(23),
                hardness: getNum(24),
                solubility: getNum(25),
                drying: getNum(26),
            },
            fattyAcids: {
                lauric: getNum(27),
                myristic: getNum(28),
                palmitic: getNum(29),
                stearic: getNum(30),
                oleic: getNum(31),
                linoleic: getNum(32),
                linolenic: getNum(33),
                ricinoleic: getNum(34),
                gadoleic: getNum(35),
                other: getNum(36)
            }
        };
    });
};
