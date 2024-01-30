import { StyleSheet, useWindowDimensions, View } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useFrameCallback,
  SharedValue,
} from "react-native-reanimated";

const gridSize = { width: 16, height: 16 };

type Size = { width: number; height: number };
type Point = { x: number; y: number };
type BallInfo = { speed: Point; pos: Point; team: Teams; disabled?: boolean };
type Teams = "1" | "2" | "3" | "4";

const ballColors: Record<Teams, string> = {
  "1": "#574A96",
  "2": "#F9B432",
  "3": "#964A62",
  "4": "#4A967E",
};
const cellColors: Record<Teams, string> = {
  "1": ballColors["2"],
  "2": ballColors["1"],
  "3": ballColors["4"],
  "4": ballColors["3"],
};

export const Grid = () => {
  const grid = useSharedValue<Teams[][]>(
    Array(gridSize.height)
      .fill(undefined)
      .map((_, index) =>
        Array(gridSize.width).fill(index >= gridSize.height / 2 ? "2" : "1"),
      ),
  );
  const { width, height } = useWindowDimensions();

  const gridSide = Math.min(width, height);
  const cellSize = {
    width: gridSide / gridSize.width,
    height: gridSide / gridSize.height,
  };
  const maxPosition = {
    x: (gridSize.width - 1) * cellSize.width,
    y: (gridSize.height - 1) * cellSize.height,
  };

  const balls = [
    useSharedValue<BallInfo>({
      pos: { x: cellSize.width * 2, y: cellSize.height },
      speed: { x: 15, y: 50 },
      team: "1",
    }),
    useSharedValue<BallInfo>({
      pos: { x: cellSize.width * 2, y: cellSize.height * 10 },
      speed: { x: -15, y: -50 },
      team: "2",
    }),
    useSharedValue<BallInfo>({
      pos: { x: cellSize.width * 8, y: cellSize.height },
      speed: { x: 15, y: -50 },
      team: "1",
      disabled: true,
    }),
    useSharedValue<BallInfo>({
      pos: { x: cellSize.width * 8, y: cellSize.height * 10 },
      speed: { x: -10, y: -50 },
      team: "2",
      disabled: true,
    }),
  ];

  const isXCollision = ({ x, y }: Point, speed: BallInfo["speed"]) => {
    "worklet";
    const remainder = {
      x: (speed.x < 0 ? -cellSize.width : 0) + (x % cellSize.width),
      y: (speed.y < 0 ? -cellSize.height : 0) + (y % cellSize.height),
    };
    const timeX = Math.abs(remainder.x / speed.x);
    const timeY = Math.abs(remainder.y / speed.y);
    return timeX > timeY;
  };

  const pointToCell = ({ x, y }: Point): Point => {
    "worklet";
    return {
      x: Math.min(
        Math.floor((x / gridSide) * gridSize.width),
        gridSize.width - 1,
      ),
      y: Math.min(
        Math.floor((y / gridSide) * gridSize.height),
        gridSize.height - 1,
      ),
    };
  };

  const getBallPoints = (position: Point): Point[] => {
    "worklet";
    return [
      { x: position.x, y: position.y },
      { x: position.x + cellSize.width, y: position.y + cellSize.height },
      { x: position.x + cellSize.width, y: position.y },
      { x: position.x, y: position.y + cellSize.height },
    ];
  };

  const isCellOccupied = ({ x, y }: Point, team: Teams): boolean => {
    "worklet";
    return grid.value[y][x] !== team;
  };
  const getIntersectedPoints = (position: Point, team: Teams) => {
    "worklet";

    return getBallPoints(position)
      .map((ballPoint) => {
        "worklet";
        const cell = pointToCell(ballPoint);
        return isCellOccupied(cell, team) ? ballPoint : undefined;
      })
      .filter((point): point is Point => !!point);
  };

  const updateBall = (ballInfo: SharedValue<BallInfo>, dt: number) => {
    "worklet";
    const { pos, speed, team } = ballInfo.value;
    let x = pos.x + (speed.x * dt * gridSide) / 30000;
    let y = pos.y + (speed.y * dt * gridSide) / 30000;
    x = Math.min(Math.max(x, 0), maxPosition.x);
    y = Math.min(Math.max(y, 0), maxPosition.y);

    let reflectX = x === 0 || x === maxPosition.x;
    let reflectY = y === 0 || y === maxPosition.y;

    const points = getIntersectedPoints({ x, y }, team);
    const cellsToFlip = points.map(pointToCell);

    if (points.length) {
      if (points.map((point) => isXCollision(point, speed)).some(Boolean))
        reflectY = true;
      else reflectX = true;
    }

    ballInfo.value = {
      ...ballInfo.value,
      speed:
        reflectX || reflectY
          ? {
              x: (reflectX ? -1 : 1) * speed.x,
              y: (reflectY ? -1 : 1) * speed.y,
            }
          : ballInfo.value.speed,
      pos: { x, y },
    };
    return cellsToFlip;
  };

  useFrameCallback(({ timeSincePreviousFrame: dt }) => {
    "worklet";
    if (!dt) return;

    const newGrid = [...grid.value];

    for (const ball of balls) {
      if (ball.value.disabled) continue;

      const cells = updateBall(ball, dt);
      if (cells) {
        for (const { x: rowIndex, y: columnIndex } of cells) {
          newGrid[columnIndex][rowIndex] = ball.value.team;
        }
      }
    }

    grid.value = newGrid;
  });

  const tap = Gesture.Tap().onStart((event) => {
    const ballInfo = balls[0];
    ballInfo.value = {
      ...ballInfo.value,
      pos: {
        x: Math.min(Math.max(event.x - cellSize.width / 2, 0), maxPosition.x),
        y: Math.min(Math.max(event.y - cellSize.height / 2, 0), maxPosition.y),
      },
      speed: ballInfo.value.speed,
    };
  });

  return (
    <GestureDetector gesture={tap}>
      <View style={{ width: gridSide, height: gridSide }}>
        {grid.value.map((row, columnIndex) =>
          row.map((_, rowIndex) => (
            <GridCell
              key={`${rowIndex}_${columnIndex}`}
              rowIndex={rowIndex}
              columnIndex={columnIndex}
              cellSize={cellSize}
              grid={grid}
            />
          )),
        )}

        {balls.map((ballInfo, index) => (
          <RectangularBall
            ballInfo={ballInfo}
            cellSize={cellSize}
            key={index}
          />
        ))}
      </View>
    </GestureDetector>
  );
};

const GridCell = ({
  rowIndex,
  columnIndex,
  cellSize,
  grid,
}: {
  rowIndex: number;
  columnIndex: number;
  cellSize: Size;
  grid: SharedValue<Teams[][]>;
}) => {
  const colorStyle = useAnimatedStyle(() => ({
    backgroundColor: cellColors[grid.value[columnIndex][rowIndex]],
  }));

  return (
    <Reanimated.View
      style={[
        {
          left: rowIndex * cellSize.width,
          top: columnIndex * cellSize.height,
          width: cellSize.width + 0.2,
          height: cellSize.height + 0.2,
          position: "absolute",
        },
        colorStyle,
      ]}
    />
  );
};

const RectangularBall = ({
  ballInfo,
  cellSize,
}: {
  ballInfo: SharedValue<BallInfo>;
  cellSize: Size;
}) => {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: ballInfo.value.pos.x },
      { translateY: ballInfo.value.pos.y },
    ],
    backgroundColor: ballInfo.value.disabled
      ? undefined
      : ballColors[ballInfo.value.team],
  }));

  return <Reanimated.View style={[cellSize, animatedStyle, styles.ball]} />;
};

export default Grid;

const styles = StyleSheet.create({
  ball: {
    pointerEvents: "none",
    position: "absolute",
  },
});
